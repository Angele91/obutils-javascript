const ShellHandler = require("../api/ShellHandler");

const exit = async ({ instance }) => {
  instance.setActive(false);
};

ShellHandler.registerCommand(":exit", exit, "It closes the shell.");
