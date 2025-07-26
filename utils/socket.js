// utils/socket.js

let ioInstance = null;

module.exports = {
  setIo: (io) => {
    ioInstance = io;
  },
  getIo: () => {
    if (!ioInstance) {
      console.warn('⚠️ getIo was called before setIo. Make sure io is initialized.');
    }
    return ioInstance;
  }
};
