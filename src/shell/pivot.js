const ShellHandler = require("../api/ShellHandler");

const pivot = async ({ instance, cmdArgs }) => {
  const pivotName = cmdArgs[0];
  instance.setPivot(pivotName);
};

ShellHandler.registerCommand("pivot", pivot);
