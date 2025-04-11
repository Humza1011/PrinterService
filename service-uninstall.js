const Service = require("node-windows").Service;
const path = require("path");

const svc = new Service({
  name: "MyPrinterService",
  script: path.join(__dirname, "index.js"),
});

svc.exists((exists) => {
  if (exists) {
    svc.on("uninstall", () => {
      console.log("Service uninstalled successfully!");
    });
    svc.uninstall();
  } else {
    console.log("Service does not exist. Nothing to uninstall.");
  }
});
