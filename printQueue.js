const fs = require("fs").promises;
const path = require("path");
const { printReceipt } = require("./printerService");

const QUEUE_FILE = path.join(__dirname, "queue.json");
const DEAD_LETTER_FILE = path.join(__dirname, "dead-letter.json");

let queue = [];
let processing = false;
let queueInitialized = false;
let queueInitPromise = null;
let processingPromise = null;

function resolveLogger(logger) {
  return logger || console;
}

// Load the persistent queue from disk.
async function loadQueueFromDisk(logger) {
  const activeLogger = resolveLogger(logger);
  try {
    const data = await fs.readFile(QUEUE_FILE, "utf8");
    const parsed = JSON.parse(data);
    queue = Array.isArray(parsed) ? parsed : [];
    activeLogger.info(`Loaded ${queue.length} jobs from persistent queue.`);
  } catch (err) {
    if (err.code === "ENOENT") {
      queue = [];
      activeLogger.info(
        "Persistent queue file not found, starting with empty queue."
      );
    } else {
      activeLogger.error("Error loading queue from disk", {
        error: err.message,
      });
      queue = [];
    }
  }
}

async function initializeQueue(logger) {
  if (queueInitialized) return;
  if (!queueInitPromise) {
    queueInitPromise = loadQueueFromDisk(logger).finally(() => {
      queueInitialized = true;
    });
  }
  await queueInitPromise;
}

// Persist the current queue to disk.
async function persistQueueToDisk(logger) {
  const activeLogger = resolveLogger(logger);
  try {
    await fs.writeFile(QUEUE_FILE, JSON.stringify(queue, null, 2));
    activeLogger.info(`Persisted ${queue.length} jobs to disk.`);
  } catch (err) {
    activeLogger.error("Error persisting queue to disk", { error: err.message });
  }
}

// Write a failed job to the dead-letter file.
async function persistFailedJob(job, logger) {
  const activeLogger = resolveLogger(logger);
  let deadJobs = [];
  try {
    const data = await fs.readFile(DEAD_LETTER_FILE, "utf8");
    const parsed = JSON.parse(data);
    deadJobs = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code !== "ENOENT") {
      activeLogger.error("Error reading dead letter file", { error: err.message });
    }
  }
  deadJobs.push(job);
  try {
    await fs.writeFile(DEAD_LETTER_FILE, JSON.stringify(deadJobs, null, 2));
    activeLogger.error("Persisted failed job to dead letter store", { job });
  } catch (err) {
    activeLogger.error("Error writing to dead letter file", {
      error: err.message,
    });
  }
}

// Return the current queue length.
function getQueueLength() {
  return queue.length;
}

// Add a new job to the queue.
function enqueuePrintJob(jobData) {
  queue.push({
    ...jobData,
    retryCount: Number(jobData?.retryCount) || 0,
  });
}

// Process the queue with retry logic and exponential backoff.
async function processPrintQueue(logger) {
  const activeLogger = resolveLogger(logger);
  await initializeQueue(activeLogger);
  if (processingPromise) return processingPromise;

  processingPromise = (async () => {
    processing = true;
    try {
      while (queue.length > 0) {
        const job = queue[0];
        let attempt = job.retryCount || 0;
        const maxAttempts = 3;
        let printed = false;

        while (attempt < maxAttempts && !printed) {
          attempt++;
          job.retryCount = attempt;
          await persistQueueToDisk(activeLogger);

          try {
            await printReceipt(job, activeLogger);
            printed = true;
          } catch (err) {
            activeLogger.error(`Print job attempt ${attempt} failed`, {
              error: err.message,
              job,
            });
            const waitTime = 1000 * Math.pow(2, attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }
        }

        queue.shift();
        if (!printed) {
          activeLogger.error("Print job failed after maximum retries", { job });
          await persistFailedJob(job, activeLogger);
        }
        await persistQueueToDisk(activeLogger);
      }
    } finally {
      processing = false;
      processingPromise = null;
    }
  })();

  return processingPromise;
}

module.exports = {
  enqueuePrintJob,
  processPrintQueue,
  getQueueLength,
  loadQueueFromDisk,
  initializeQueue,
  persistQueueToDisk,
};
