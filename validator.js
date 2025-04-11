function validatePrintData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid data format");
  }
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new Error("No items provided");
  }
  let computedTotal = 0;
  data.items.forEach((item, index) => {
    if (!item.name || typeof item.name !== "string") {
      throw new Error(`Invalid or missing item name at index ${index}`);
    }
    const price = parseFloat(item.price);
    if (isNaN(price)) {
      throw new Error(
        `Invalid item price for "${item.name}" at index ${index}`
      );
    }
    item.price = price;
    computedTotal += price;
  });
  data.computedTotal = computedTotal;
}

module.exports = { validatePrintData };
