require("dotenv").config();
const { ThermalPrinter, PrinterTypes } = require("node-thermal-printer");
const path = require("path");
const fs = require("fs");
const printerModule = require("@thiagoelg/node-printer");
const { createCanvas, registerFont } = require("canvas");

// Register the Urdu font – ensure this file exists in your project folder.
registerFont("./Jameel Noori Nastaleeq Kasheeda.ttf", {
  family: "JameelNooriNastaleeqKasheeda",
});

const PRINTER_INTERFACE =
  process.env.PRINTER_INTERFACE || "printer:Black Copper 80";
const PRINTER_TYPE = process.env.PRINTER_TYPE || "EPSON";

let printerInstance = null;
let lastPollStatus = null;

function createPrinterInstance() {
  if (printerInstance) return printerInstance;
  printerInstance = new ThermalPrinter({
    type: PrinterTypes[PRINTER_TYPE] || PrinterTypes.EPSON,
    interface: PRINTER_INTERFACE,
    driver: printerModule,
  });
  return printerInstance;
}

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

/**
 * Helper function to wrap text so that it fits within maxWidth.
 * Splits words into as many lines as needed.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context.
 * @param {string} text - The text to wrap.
 * @param {number} maxWidth - Maximum allowed width (in px).
 * @returns {string[]} - Array of strings, each representing one wrapped line.
 */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    let testLine = currentLine ? currentLine + " " + word : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine !== "") {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Inserts a separator (blank line, dashed line, blank line) into an array.
 * The dashed line is generated to fill the available width.
 *
 * @param {Array} linesArr - The main lines array.
 * @param {number} availableWidth - Available width in pixels.
 * @param {number} fontSize - Font size in px.
 */
function addSeparator(linesArr, availableWidth, fontSize) {
  // Estimate the width of a dash character.
  // Here we assume a dash is roughly fontSize * 0.6 in width.
  const dashChar = "-";
  const dashWidth = fontSize * 0.6;
  const dashCount = Math.floor(10000 / (fontSize / 2));
  const dashLine = dashChar.repeat(dashCount);
  linesArr.push({ text: "", align: "right" });
  // We set alignment to "left" so the dash line begins at the left margin.
  linesArr.push({ text: dashLine, align: "left" });
  linesArr.push({ text: "", align: "right" });
}

/**
 * Generates a PNG buffer of the receipt in Urdu.
 * It organizes the receipt in sections with separators and uses a dynamic height.
 * Supported types: "basic", "installment", and "detailed".
 *
 * @param {Object} data - Receipt data.
 * @returns {Buffer} - PNG image buffer of the receipt.
 */
function generateReceiptImage(data) {
  // Define canvas and text settings.
  const canvasWidth = 550; // Adjusted width as needed.
  const marginLeft = 10;
  const marginRight = 10;
  const availableWidth = canvasWidth - marginLeft - marginRight;
  const topPadding = 20;
  const bottomPadding = 20;
  const fontSize = 24; // Adjust as needed.
  const lineSpacing = 3; // Additional spacing between wrapped lines.

  // Build sections as arrays of line objects { text, align }.
  const sections = [];

  // --- Section 0: Company Header ---
  // Add a header at the top of every receipt.
  const companyHeader = [];
  companyHeader.push({ text: "الجنّت ٹریڈرز", align: "center" });
  sections.push(companyHeader);

  // --- Section 1: Receipt Header (title and phone numbers) ---
  const headerSection = [];
  // Receipt title based on type.
  if (data.type === "basic") {
    headerSection.push({ text: "خریداری رسید", align: "center" });
  } else if (data.type === "installment") {
    headerSection.push({ text: "قسط خریداری کی رسید", align: "center" });
  } else if (data.type === "detailed") {
    headerSection.push({ text: "تفصیلی ادائیگی کی رسید", align: "center" });
  } else {
    headerSection.push({ text: "خریداری رسید", align: "center" });
  }
  // Add extra space between the receipt title and phone numbers.
  headerSection.push({ text: "", align: "right" });
  headerSection.push({ text: "چراغ دین: 03455420705", align: "right" });
  headerSection.push({ text: "علی جان: 03492633381", align: "right" });
  sections.push(headerSection);

  // --- Section 2: Customer and Employee Details (and installment extras) ---
  const customerSection = [];
  if (data.employeeName) {
    customerSection.push({
      text: `ملازم: ${data.employeeName}`,
      align: "right",
    });
  }
  if (data.customerName) {
    customerSection.push({
      text: `گاہک: ${data.customerName}`,
      align: "right",
    });
  }
  if (data.type === "installment") {
    if (data.khataNumber) {
      customerSection.push({
        text: `خاتا نمبر: ${data.khataNumber}`,
        align: "right",
      });
    }
    if (data.cnic) {
      customerSection.push({
        text: `شناختی کارڈ: ${data.cnic}`,
        align: "right",
      });
    }
  }
  if (customerSection.length) {
    sections.push(customerSection);
  }

  // --- Section 3: Body (Products and/or Payment details) ---
  const bodySection = [];
  if (data.type === "basic" || data.type === "installment") {
    bodySection.push({ text: "خریداری کی اشیاء:", align: "right" });
    const products = data.products || data.items || [];
    products.forEach((product) => {
      let prodLine = `${product.name} (${product.quantity} x ${parseFloat(
        product.price
      ).toFixed(2)} Rs)`;
      if (product.discount && parseFloat(product.discount) > 0) {
        prodLine += ` (رعایت: ${parseFloat(product.discount).toFixed(2)} Rs)`;
      }
      if (data.type === "installment" && product.color) {
        prodLine += ` (رنگ: ${product.color})`;
      }
      bodySection.push({ text: prodLine, align: "right" });
      // Add space between every product.
      bodySection.push({ text: "", align: "right" });
    });
    // If there are payment details, add a separator between the products and totals.
    let hasPaymentDetails = false;
    if (
      data.type === "basic" &&
      (data.totalAmount !== undefined ||
        (data.discount && parseFloat(data.discount) > 0))
    ) {
      hasPaymentDetails = true;
    }
    if (
      data.type === "installment" &&
      (data.downPayment !== undefined ||
        data.monthlyInstallment !== undefined ||
        data.totalAmount !== undefined ||
        data.remainingAmount !== undefined)
    ) {
      hasPaymentDetails = true;
    }
    if (hasPaymentDetails) {
      addSeparator(bodySection, availableWidth, fontSize);
    }
    // Payment details for basic receipts.
    if (data.type === "basic") {
      if (data.totalAmount !== undefined) {
        bodySection.push({
          text: `کل: ${parseFloat(data.totalAmount).toFixed(2)} Rs`,
          align: "right",
        });
      }
      if (data.discount && parseFloat(data.discount) > 0) {
        bodySection.push({
          text: `رعایت: ${parseFloat(data.discount).toFixed(2)} Rs`,
          align: "right",
        });
      }
    }
    // Payment details for installment receipts.
    if (data.type === "installment") {
      if (data.downPayment !== undefined) {
        bodySection.push({
          text: `ایڈوانس: ${parseFloat(data.downPayment).toFixed(2)} Rs`,
          align: "right",
        });
      }
      if (data.monthlyInstallment !== undefined) {
        bodySection.push({
          text: `ماہانہ قسط: ${parseFloat(data.monthlyInstallment).toFixed(
            2
          )} Rs`,
          align: "right",
        });
      }
      if (data.totalAmount !== undefined) {
        bodySection.push({
          text: `کل رقم: ${parseFloat(data.totalAmount).toFixed(2)} Rs`,
          align: "right",
        });
      }
      if (data.remainingAmount !== undefined) {
        bodySection.push({
          text: `باقی رقم: ${parseFloat(data.remainingAmount).toFixed(2)} Rs`,
          align: "right",
        });
      }
    }
  } else if (data.type === "detailed") {
    // Detailed receipt: Add payment history.
    if (data.totalPayments && data.totalPayments.length > 0) {
      bodySection.push({ text: "ادائیگی کی تاریخ:", align: "right" });
      data.totalPayments.forEach((payment, index) => {
        const date = new Date(payment.saleDate).toLocaleDateString("ur-PK");
        const paymentLine = `#${index + 1}: ${date} - ${parseFloat(
          payment.paidAmount
        ).toFixed(2)} Rs`;
        bodySection.push({ text: paymentLine, align: "right" });
      });
    }
    // If both payment history and totals exist, insert a separator between them.
    if (
      data.totalPayments &&
      data.totalPayments.length > 0 &&
      data.totalAmount !== undefined
    ) {
      addSeparator(bodySection, availableWidth, fontSize);
    }
    // Now add totals details.
    if (data.totalAmount !== undefined) {
      const totalPaid = data.totalPayments
        ? data.totalPayments.reduce((sum, p) => sum + Number(p.paidAmount), 0)
        : 0;
      bodySection.push({
        text: `کل رقم: ${parseFloat(data.totalAmount).toFixed(2)} Rs`,
        align: "right",
      });
      bodySection.push({
        text: `ادا شدہ رقم: ${totalPaid.toFixed(2)} Rs`,
        align: "right",
      });
      if (data.remainingAmount !== undefined) {
        bodySection.push({
          text: `باقی رقم: ${parseFloat(data.remainingAmount).toFixed(2)} Rs`,
          align: "right",
        });
      }
    }
  }
  if (bodySection.length) {
    sections.push(bodySection);
  }

  // --- Section 4: Footer ---
  const footerSection = [];
  footerSection.push({ text: "ادائیگی کا شکریہ!", align: "center" });
  sections.push(footerSection);

  // Combine all sections into a single "lines" array,
  // inserting a blank line and separator after each section.
  let lines = [];
  sections.forEach((section, index) => {
    section.forEach((line) => lines.push(line));
    // Add a separator after each section except the last.
    if (index < sections.length - 1) {
      addSeparator(lines, availableWidth, fontSize);
    }
  });

  // --- Dynamic Canvas Height & Text Wrapping ---
  const tempCanvas = createCanvas(canvasWidth, 1000);
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.font = `${fontSize}px "JameelNooriNastaleeqKasheeda"`;
  tempCtx.direction = "rtl"; // Ensure measurement uses RTL direction.

  let finalLines = [];
  lines.forEach((lineObj) => {
    const wrapped = wrapText(tempCtx, lineObj.text, availableWidth);
    if (wrapped.length === 0) {
      finalLines.push({ text: "", align: lineObj.align });
    } else {
      wrapped.forEach((wrappedLine) =>
        finalLines.push({ text: wrappedLine, align: lineObj.align })
      );
    }
  });

  const lineHeight = fontSize + lineSpacing;
  const requiredHeight =
    topPadding + bottomPadding + finalLines.length * lineHeight;

  // Create the final canvas.
  const canvas = createCanvas(canvasWidth, requiredHeight);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvasWidth, requiredHeight);

  // Set text style – force the Urdu font only.
  ctx.fillStyle = "#000000";
  ctx.font = `${fontSize}px "JameelNooriNastaleeqKasheeda"`;
  ctx.direction = "rtl";
  ctx.textBaseline = "top";

  let yPos = topPadding;
  finalLines.forEach((lineObj) => {
    let xPos;
    if (lineObj.align === "center") {
      ctx.textAlign = "center";
      xPos = canvasWidth / 2;
    } else if (lineObj.align === "left") {
      ctx.textAlign = "left";
      xPos = marginLeft;
    } else {
      ctx.textAlign = "right";
      xPos = canvasWidth - marginRight;
    }
    ctx.fillText(lineObj.text, xPos, yPos);
    yPos += lineHeight;
  });

  return canvas.toBuffer("image/png");
}

async function printReceipt(printData, logger) {
  try {
    await initPrinter(logger);
    const printer = createPrinterInstance();
    printer.clear();

    if (process.env.PRINT_MODE === "image") {
      const imageBuffer = generateReceiptImage(printData);
      const tempImagePath = path.join(__dirname, "temp_receipt.png");
      fs.writeFileSync(tempImagePath, imageBuffer);
      await printer.printImage(tempImagePath);
    } else {
      // Fallback text printing (if needed)
      printer.alignCenter();
      printer.bold(true);
      printer.println("خریداری رسید");
      printer.bold(false);
      printer.newLine();
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
