const ShellHandler = require("../api/ShellHandler");

const help = async ({ instance }) => {
  ShellHandler.registeredCommands.forEach((cmd) => {
    instance.log(`${cmd.name} ${cmd.description}`);
  });
};

ShellHandler.registerCommand(":help", help, "The Help command ;)");
