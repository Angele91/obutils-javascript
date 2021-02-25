class ShellHandler {
  static registeredCommands = [];

  static registerCommand(
    name,
    handler,
    description = "No description defined."
  ) {
    this.registeredCommands.push({
      name,
      handler,
      description,
    });
  }

  static async runCommand(cmd, ...args) {
    const spl = cmd.split(" ");
    const cmdName = spl[0];
    const command = this.registeredCommands.find((cmd) => cmd.name === cmdName);
    const instance = args[0];
    if (!command) {
      instance.log(
        "Invalid command. Try :help to check all commands available."
      );
      return;
    }

    await command.handler({
      cmd,
      instance,
      cmdArgs: [...spl.slice(1)],
      args: { ...args },
    });
  }
}

module.exports = ShellHandler;
