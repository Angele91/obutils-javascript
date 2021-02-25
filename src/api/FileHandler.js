const fs = require("fs");

class FileHandler {
  /**
   * @description Method to save a string to a file.
   * @param {string} path
   * @param {string} string
   */
  static save(path, string) {
    let fileName = path;
    if (!fileName) fileName = `./${Math.random() * 100}.txt`;

    return new Promise((resolve, reject) => {
      fs.writeFile(fileName, string, (err) => {
        if (err) return reject(err);
        resolve(fileName);
      });
    });
  }
}

module.exports = { FileHandler };
