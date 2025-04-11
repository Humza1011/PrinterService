// index.js
require("dotenv").config();
var cors = require("cors");
const express = require("express");
const morgan = require("morgan");
const winston = require("winston");
require("winston-daily-rotate-file");

const http = require("http");
const {
  enqueuePrintJob,
  processPrintQueue,
  persistQueueToDisk,
  getQueueLength,
} = require("./printQueue");
// const { validatePrintData } = require("./validator");
const { startPrinterPolling } = require("./printerService");

const app = express();
app.use(cors());
const PORT = process.env.PRINT_SERVER_PORT || 3001;

// Configure Winston with Daily Rotate
const transport = new winston.transports.DailyRotateFile({
  filename: "print-server-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxSize: "20m",
  maxFiles: "14d",
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console(), transport],
});

// Pipe Morgan logs into Winston.
app.use(
  morgan("combined", { stream: { write: (msg) => logger.info(msg.trim()) } })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Extended health-check endpoint.
app.get("/healthz", async (req, res) => {
  const remoteAddr = req.socket.remoteAddress;
  const isLocal =
    remoteAddr && (remoteAddr.startsWith("127.") || remoteAddr === "::1");
  let printerStatus = "unknown";
  try {
    if (
      process.env.PRINTER_INTERFACE &&
      process.env.PRINTER_INTERFACE.startsWith("printer:")
    ) {
      printerStatus = "spooler";
    } else {
      const printerService = require("./printerService");
      printerStatus = (await printerService
        .createPrinterInstance()
        .isPrinterConnected())
        ? "connected"
        : "disconnected";
    }
  } catch (err) {
    printerStatus = "error";
  }
  res.status(200).json({
    status: "OK",
    printer: printerStatus,
    queueLength: getQueueLength(),
  });
});

// Security middleware: Allow only local requests.
// app.use((req, res, next) => {
//   const remoteAddr = req.socket.remoteAddress;
//   if (remoteAddr && (remoteAddr.startsWith("127.") || remoteAddr === "::1")) {
//     next();
//   } else {
//     res.status(403).json({ error: "Forbidden" });
//   }
// });

// Endpoint to receive print jobs.
app.post("/print", (req, res) => {
  const printData = req.body;
  logger.info("Received print job", { printData });
  // try {
  //   validatePrintData(printData);
  // } catch (err) {
  //   logger.error("Validation error", { error: err.message });
  //   return res.status(400).json({ error: err.message });
  // }
  enqueuePrintJob(printData);
  processPrintQueue(logger).catch((err) =>
    logger.error("Error processing print queue", { error: err.message })
  );
  persistQueueToDisk(logger).catch((err) =>
    logger.error("Error persisting queue", { error: err.message })
  );
  res.json({ status: "Print job enqueued" });
});

// Global error handler.
app.use((err, req, res, next) => {
  logger.error("Unhandled error", { error: err.message });
  res.status(500).json({ error: "Internal server error" });
});

const server = http.createServer(app);
server.listen(PORT, "127.0.0.1", () => {
  logger.info(`Local Print Server running on http://127.0.0.1:${PORT}`);
});

// Graceful shutdown.
async function shutdown() {
  logger.info("Shutdown initiated. Waiting for queue processing...");
  try {
    await processPrintQueue(logger);
  } catch (e) {
    logger.error("Error processing queue during shutdown", {
      error: e.message,
    });
  } finally {
    server.close(() => {
      logger.info("HTTP server closed. Exiting process.");
      process.exit(0);
    });
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start printer polling (logs on status change).
startPrinterPolling(logger, 30000);
