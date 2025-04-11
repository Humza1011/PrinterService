const fs = require("fs").promises;
const path = require("path");
const { printReceipt } = require("./printerService");

const QUEUE_FILE = path.join(__dirname, "queue.json");
const DEAD_LETTER_FILE = path.join(__dirname, "dead-letter.json");

let queue = [];
let processing = false;

// Load the persistent queue from disk.
async function loadQueueFromDisk(logger) {
  try {
    const data = await fs.readFile(QUEUE_FILE, "utf8");
    queue = JSON.parse(data);
    logger.info(`Loaded ${queue.length} jobs from persistent queue.`);
  } catch (err) {
    if (err.code === "ENOENT") {
      queue = [];
      logger.info(
        "Persistent queue file not found, starting with empty queue."
      );
    } else {
      logger.error("Error loading queue from disk", { error: err.message });
    }
  }
}

// Persist the current queue to disk.
async function persistQueueToDisk(logger) {
  try {
    await fs.writeFile(QUEUE_FILE, JSON.stringify(queue, null, 2));
    logger.info(`Persisted ${queue.length} jobs to disk.`);
  } catch (err) {
    logger.error("Error persisting queue to disk", { error: err.message });
  }
}

// Write a failed job to the dead-letter file.
async function persistFailedJob(job, logger) {
  let deadJobs = [];
  try {
    const data = await fs.readFile(DEAD_LETTER_FILE, "utf8");
    deadJobs = JSON.parse(data);
  } catch (err) {
    if (err.code !== "ENOENT") {
      logger.error("Error reading dead letter file", { error: err.message });
    }
  }
  deadJobs.push(job);
  try {
    await fs.writeFile(DEAD_LETTER_FILE, JSON.stringify(deadJobs, null, 2));
    logger.error("Persisted failed job to dead letter store", { job });
  } catch (err) {
    logger.error("Error writing to dead letter file", { error: err.message });
  }
}

// Return the current queue length.
function getQueueLength() {
  return queue.length;
}

// Add a new job to the queue.
function enqueuePrintJob(jobData) {
  jobData.retryCount = 0;
  queue.push(jobData);
}

// Process the queue with retry logic and exponential backoff.
async function processPrintQueue(logger) {
  if (processing) return;
  processing = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift();
      let attempt = job.retryCount || 0;
      const maxAttempts = 3;
      let printed = false;
      while (attempt < maxAttempts && !printed) {
        attempt++;
        job.retryCount = attempt;
        try {
          await printReceipt(job, logger);
          printed = true;
        } catch (err) {
          logger.error(`Print job attempt ${attempt} failed`, {
            error: err.message,
            job,
          });
          const waitTime = 1000 * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
      if (!printed) {
        logger.error("Print job failed after maximum retries", { job });
        await persistFailedJob(job, logger);
      }
    }
    await persistQueueToDisk(logger);
  } finally {
    processing = false;
  }
}

module.exports = {
  enqueuePrintJob,
  processPrintQueue,
  getQueueLength,
  loadQueueFromDisk,
  persistQueueToDisk,
};

// Load persistent queue on module load.
(async () => {
  try {
    await loadQueueFromDisk(console);
  } catch (e) {
    console.error("Error loading persistent queue:", e);
  }
})();
