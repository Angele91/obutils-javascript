const { Command } = require("@oclif/command");
const { cli } = require("cli-ux");
const ShellHandler = require("../api/ShellHandler");
const { Pool } = require("pg");
const { ConfigurationPersistence } = require("../api/ConfigurationPersistence");
require("../shell");

class ShellCommand extends Command {
  constructor(argv, config) {
    super(argv, config);
    this.pivot = "openbravo";
    this.active = true;
    this.dbUser = "tad";
    this.dbPwd = "tad";
    this.dbHost = "localhost";
    this.dbPort = 5432;
    this.configManager = new ConfigurationPersistence();
  }

  set(key, value) {
    this[key] = value;
  }

  getPivotPrefix() {
    return `[${this.dbUser}@${this.pivot}]`;
  }

  setPivot(pivotName) {
    this.pivot = pivotName;
  }

  setActive(active) {
    this.active = active;
  }

  async initializePool() {
    cli.info(
      `Initializing pool with: (${this.dbUser}@${this.pivot} in ${this.dbHost}:${this.dbPort})`
    );
    this.pool = new Pool({
      user: this.dbUser,
      host: this.dbHost,
      database: this.pivot,
      password: this.dbPwd,
      port: this.dbPort,
    });
  }

  async getClientFromPool() {
    return await this.pool.connect();
  }

  async testPoolConnection() {
    const client = await this.getClientFromPool();
    try {
      await client.query("SELECT NOW()");
      return true;
    } catch (error) {
      return false;
    } finally {
      client.release();
    }
  }

  async executeQuery(query) {
    const client = await this.getClientFromPool();

    try {
      const response = await client.query(query);
      return response;
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  async run() {
    if (!this.configManager.isConfigFileCreated()) {
      await this.configManager.save(this);
    }

    await this.configManager.load(this);

    cli.action.start("Starting pool...");
    this.initializePool();

    try {
      await this.testPoolConnection();
    } catch (error) {
      cli.warn(
        "Pool can not be initialized. Please, use :db to set the correct database credentials."
      );
    }

    cli.action.stop();

    while (this.active) {
      const command = await cli.prompt(`${this.getPivotPrefix()}`);
      await ShellHandler.runCommand(command, this);
    }
  }
}

ShellCommand.description = `
Utility shell
`;

ShellCommand.flags = {};

module.exports = ShellCommand;
