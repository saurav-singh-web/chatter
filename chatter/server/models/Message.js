const mongoose = require("mongoose");

const messageSchema =
  new mongoose.Schema({
    type: {
      type: String,
      enum: [
        "message",
        "private_message",
      ],
      required: true,
    },

    username: String,
    from: String,
    to: String,
    text: String,

    image: {
      type: String,
      default: "",
    },

    audio: {
      type: String,
      default: "",
    },

    file: {
      data: {
        type: String,
        default: "",
      },
      name: {
        type: String,
        default: "",
      },
      type: {
        type: String,
        default: "",
      },
      size: {
        type: Number,
        default: 0,
      },
    },

    timestamp: {
      type: Number,
      default: Date.now,
    },

    edited: {
      type: Boolean,
      default: false,
    },

    replyTo: {
      username: String,
      text: String,
    },

    // Read receipt
    readBy: {
      type: [String],
      default: [],
    },

    // Saved in DB
    delivered: {
      type: Boolean,
      default: false,
    },

    // Reached receiver socket
    received: {
      type: Boolean,
      default: false,
    },
  });

module.exports =
  mongoose.model(
    "Message",
    messageSchema
  );