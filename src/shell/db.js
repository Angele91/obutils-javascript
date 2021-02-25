const ShellHandler = require("../api/ShellHandler");
const { cli } = require("cli-ux");

const ASSOCIATIONS = {
  user: "dbUser",
  pwd: "dbPwd",
  host: "dbHost",
  port: "dbPort",
  db: "pivot",
};

const db = async ({ instance, cmdArgs }) => {
  const type = ASSOCIATIONS[cmdArgs[0]];

  if (!type) {
    instance.log(
      `Invalid property identifier. Use one of these: `,
      Object.keys(ASSOCIATIONS).join(", ")
    );
    return;
  }

  const previousValue = JSON.parse(JSON.stringify(instance[type]));
  const value = cmdArgs[1];

  instance.set(type, value);
  instance.log(`Property ${type} set to ${value}.`);

  cli.action.start("Reinitializing pool...", "Loading...", {
    stdout: true,
  });

  instance.initializePool();
  const canConnect = await instance.testPoolConnection();

  if (!canConnect) {
    instance.log(
      "Can't connect with the provided information. The modified information will go back to the previous value."
    );
    instance.set(type, previousValue);
    return;
  }

  cli.action.stop("Pool reinitialized successfully.");
  await instance.configManager.save(instance);
};

ShellHandler.registerCommand(":db", db, "It changes the database credentials.");
