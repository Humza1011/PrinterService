// printerService.js
require("dotenv").config();
const { ThermalPrinter, PrinterTypes } = require("node-thermal-printer");
const path = require("path");
const printerModule = require("@thiagoelg/node-printer");

const PRINTER_INTERFACE =
  process.env.PRINTER_INTERFACE || "printer:Black Copper 80";
const PRINTER_TYPE = process.env.PRINTER_TYPE || "EPSON";

let printerInstance = null;
let lastPollStatus = null;

// Create (or retrieve) a ThermalPrinter instance configured for Windows spooler printing.
function createPrinterInstance() {
  if (printerInstance) return printerInstance;
  printerInstance = new ThermalPrinter({
    type: PrinterTypes[PRINTER_TYPE] || PrinterTypes.EPSON,
    interface: PRINTER_INTERFACE,
    driver: printerModule, // Use the updated Windows printer driver module
  });
  return printerInstance;
}

// Initialize the printer by optionally checking its connectivity.
// For spooler mode, the connectivity check is often skipped.
async function initPrinter(logger) {
  const printer = createPrinterInstance();
  if (PRINTER_INTERFACE.startsWith("printer:")) {
    logger.info(
      "Using Windows spooler interface; skipping connectivity check."
    );
    return;
  }
  try {
    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      logger.error(`Printer not connected at ${PRINTER_INTERFACE}`);
      throw new Error("Printer is not connected");
    }
    logger.info("Printer connected successfully");
  } catch (err) {
    logger.error("Printer initialization error", { error: err.message });
    throw err;
  }
}

// Build and send a formatted receipt to the printer.
async function printReceipt(printData, logger) {
  try {
    await initPrinter(logger);
    const printer = createPrinterInstance();
    printer.clear();

    // Print header using the store name from environment variables.
    const storeName = process.env.STORE_NAME || "Store Name";
    printer.alignCenter();
    printer.bold(true);
    printer.println(storeName);
    printer.bold(false);
    printer.newLine();
    printer.drawLine();

    // Choose receipt layout based on the type.
    switch (printData.type) {
      case "basic":
        printBasicReceipt(printer, printData, logger);
        break;
      case "installment":
        printInstallmentReceipt(printer, printData, logger);
        break;
      case "detailed":
        printDetailedReceipt(printer, printData, logger);
        break;
      default:
        logger.warn("Unknown receipt type; defaulting to basic layout.");
        printBasicReceipt(printer, printData, logger);
        break;
    }

    printer.newLine();
    printer.cut();

    const result = await printer.execute();
    if (result) {
      logger.info("Receipt printed successfully");
    } else {
      logger.error("Receipt printing failed");
      throw new Error("Failed to print the receipt");
    }
  } catch (err) {
    logger.error("Error in printReceipt", { error: err.message });
    throw err;
  }
}

function printBasicReceipt(printer, data, logger) {
  printer.alignLeft();

  // Print customer and employee details.
  if (data.customerName) {
    printer.println(`Customer: ${data.customerName}`);
  }
  if (data.employeeName) {
    printer.println(`Employee: ${data.employeeName}`);
  }
  printer.newLine();

  printer.println("Purchased Items:");
  printer.drawLine();

  // Use the "products" field; fallback to "items" if needed.
  const products = data.products || data.items || [];
  products.forEach((product) => {
    let line = `${product.name} (${product.quantity} x $${parseFloat(
      product.price
    ).toFixed(2)})`;
    if (product.discount && parseFloat(product.discount) > 0) {
      line += ` (-$${parseFloat(product.discount).toFixed(2)})`;
    }
    printer.println(line);
  });
  printer.drawLine();

  // Display total amount and overall discount if any.
  printer.alignRight();
  printer.bold(true);
  printer.println(`Total: $${parseFloat(data.totalAmount).toFixed(2)}`);
  printer.bold(false);
  if (data.discount && parseFloat(data.discount) > 0) {
    printer.println(`Discount: $${parseFloat(data.discount).toFixed(2)}`);
  }
}

function printInstallmentReceipt(printer, data, logger) {
  // Section: Installment Receipt Header
  printer.alignLeft();
  printer.println("Installment Purchase Receipt");
  printer.newLine();

  // Section: Business Contact Details (static)
  printer.alignCenter();
  printer.println("Chirag din: 03455420705");
  printer.println("Ali jan: 03492633381");
  printer.newLine();

  // Section: Customer & Account Details
  printer.alignLeft();
  printer.println(`Khata Number: ${data.khataNumber}`);
  printer.println(`Customer: ${data.customerName}`);
  printer.println(`Phone: ${data.customerPhone}`);
  printer.println(`Employee: ${data.employeeName}`);
  if (data.cnic) {
    printer.println(`CNIC: ${data.cnic}`);
  }
  printer.newLine();
  printer.drawLine();

  // Section: List of Products
  data.products.forEach((product) => {
    let productLine = `${product.name} (Qty: ${
      product.quantity
    }) - ${parseFloat(product.price).toFixed(2)} Rs`;
    if (product.color) {
      productLine += ` [Color: ${product.color}]`;
    }
    if (product.discount && parseFloat(product.discount) > 0) {
      productLine += ` (Discount: ${parseFloat(product.discount).toFixed(
        2
      )}) Rs`;
    }
    printer.println(productLine);
  });
  printer.drawLine();
  printer.newLine();

  // Section: Payment Details
  printer.alignLeft();
  printer.println(
    `Down Payment: ${parseFloat(data.downPayment).toFixed(2)} Rs`
  );
  printer.println(
    `Monthly Installment: ${parseFloat(data.monthlyInstallment).toFixed(2)} Rs`
  );
  printer.println(
    `Total Amount: ${parseFloat(data.totalAmount).toFixed(2)} Rs`
  );
  if (data.discount && parseFloat(data.discount) > 0) {
    printer.println(`Discount: ${parseFloat(data.discount).toFixed(2)} Rs`);
  }
  printer.newLine();

  printer.alignRight();
  printer.bold(true);
  printer.println(
    `Remaining Total Amount: ${parseFloat(
      data.totalAmount - data.discount - data.downPayment
    ).toFixed(2)} Rs`
  );
  printer.bold(false);
  printer.newLine();

  // Section: Footer – Thank You Message
  printer.alignCenter();
  printer.println("Thank you for your business!");
}

function printDetailedReceipt(printer, data, logger) {
  // Header for detailed payment receipt.
  printer.alignLeft();
  printer.println("Payment Detailed Receipt");
  printer.newLine();
  printer.alignCenter();
  printer.println("Chirag din: 03455420705");
  printer.println("Ali jan: 03492633381");
  printer.newLine();
  // Customer and employee details.
  printer.alignLeft();
  printer.println(`Customer: ${data.customerName}`);
  printer.println(`Employee: ${data.employeeName}`);
  printer.newLine();
  printer.drawLine();

  // Payment history.
  printer.println("Payment History:");
  printer.drawLine();
  data.totalPayments.forEach((payment, index) => {
    // Format the sale date for readability.
    const saleDateFormatted = new Date(payment.saleDate).toLocaleDateString();
    printer.println(
      `#${index + 1}: ${saleDateFormatted} - ${parseFloat(
        payment.paidAmount
      ).toFixed(2)} Rs`
    );
  });
  printer.drawLine();
  printer.newLine();
  // Payment summary.
  const totalPaid = data.totalPayments.reduce((sum, payment) => {
    return sum + Number(payment.paidAmount);
  }, 0);
  printer.alignLeft();
  printer.println(
    `Total Amount: ${parseFloat(data.totalAmount).toFixed(2)} Rs`
  );
  printer.println(`Total Paid: ${totalPaid.toFixed(2)} Rs`);
  printer.println(
    `Remaining Amount: ${parseFloat(data.remainingAmount).toFixed(2)} Rs`
  );
  printer.newLine();

  // Footer.
  printer.alignCenter();
  printer.println("Thank you for your payment!");
}

// Cleanup printer connection resources (if the driver offers a cleanup method).
async function cleanupPrinter(logger) {
  try {
    const printer = createPrinterInstance();
    if (typeof printer.close === "function") {
      await printer.close();
      logger.info("Printer connection closed");
    } else {
      logger.info("No cleanup method available for printer instance");
    }
  } catch (err) {
    logger.error("Error during printer cleanup", { error: err.message });
  }
}

// Poll printer status periodically and log only on status change.
async function pollPrinterStatus(logger) {
  let currentStatus = null;
  if (PRINTER_INTERFACE.startsWith("printer:")) {
    currentStatus = "spooler";
  } else {
    try {
      const printer = createPrinterInstance();
      currentStatus = (await printer.isPrinterConnected())
        ? "connected"
        : "disconnected";
    } catch (err) {
      currentStatus = "error";
    }
  }
  if (currentStatus !== lastPollStatus) {
    logger.info(`Printer status changed: ${lastPollStatus} → ${currentStatus}`);
    lastPollStatus = currentStatus;
  }
}

// Begin polling printer status at the specified interval.
function startPrinterPolling(logger, intervalMs) {
  setInterval(() => {
    pollPrinterStatus(logger);
  }, intervalMs);
}

module.exports = {
  printReceipt,
  initPrinter,
  createPrinterInstance,
  pollPrinterStatus,
  startPrinterPolling,
  cleanupPrinter,
};
