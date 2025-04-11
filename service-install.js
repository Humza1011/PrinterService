const Service = require("node-windows").Service;
const path = require("path");

const svc = new Service({
  name: "MyPrinterService",
  description: "Handles printing from your web-based POS",
  script: path.join(__dirname, "index.js"),
  nodeOptions: ["--harmony", "--max_old_space_size=256"],
});

svc.on("install", () => {
  console.log("Service installed successfully, starting service...");
  svc.start();
});

svc.install();
