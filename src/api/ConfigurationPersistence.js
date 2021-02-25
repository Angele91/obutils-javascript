const fs = require("fs");
const { cli } = require("cli-ux");

const CONFIG_PATH = "./configuration.json";
const CONFIG_ENTRIES = ["pivot", "dbUser", "dbPwd", "dbHost"];

class ConfigurationPersistence {
  /**
   * @description Method to save the configuration object
   * @param {{ pivot: string, dbUser: string, dbPwd: string, dbHost: string }} configurationObject
   */
  save(instance = {}) {
    return new Promise((resolve) => {
      cli.action.start("Saving configuration file...");
      const config = Object.keys(instance)
        .filter((key) => CONFIG_ENTRIES.includes(key))
        .reduce((prev, curr) => {
          return { ...prev, [curr]: instance[curr] };
        }, {});
      fs.writeFile(CONFIG_PATH, JSON.stringify(config), () => {
        cli.action.stop("Configuration file saved!");
        resolve();
      });
    });
  }

  /**
   * @description Method that will load into a shell instance the configuration.
   * @param {any} instance
   */
  async load(instance) {
    return new Promise((resolve) => {
      cli.action.start("Loading configuration file...");
      fs.readFile(CONFIG_PATH, (err, data) => {
        const obj = JSON.parse(data);
        Object.keys(obj).forEach((key) => instance.set(key, obj[key]));
        cli.action.stop("Configuration file loaded!");
        resolve();
      });
    });
  }

  /**
   * @description This method will return if the config path is created already.
   */
  isConfigFileCreated() {
    return fs.existsSync(CONFIG_PATH);
  }
}

module.exports = { ConfigurationPersistence };
