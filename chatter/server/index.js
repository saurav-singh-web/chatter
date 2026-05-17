require("dotenv").config();
const Message = require("./models/Message");
const express = require("express");
const cors = require("cors");
const http = require("http");
const { WebSocketServer } = require("ws"); 
const mongoose = require("mongoose");
const User = require("./models/User");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();
app.use(cors());

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("Connected to MongoDB ✅");
  })
  .catch((err) => console.error("MongoDB connection error:", err));

app.get("/", (req, res) => {
  res.json({ status: "Chatter server running 🚀" });
});

app.get("/history/private", async (req, res) => {
  const { user1, user2, before } = req.query;

  try {
    const query = {
      type: "private_message",
      $or: [
        { from: user1, to: user2 },
        { from: user2, to: user1 },
      ],
    };

    if (before) {
      query.timestamp = { $lt: Number(before) };
    }

    const messages = await Message.find(query)
      .sort({ timestamp: -1 })
      .limit(20);

    res.json(messages.reverse());
  } catch (err) {
    console.error("Error loading private history:", err);
    res.status(500).json({ error: "Failed to load history" });
  }
});

app.post("/register", express.json(), async (req, res) => {
  const { username, password } = req.body;
   console.log("Register attempt:", username);

  try {
    // check if username already exists
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(400).json({ error: "Username already taken" });
    }

    // hash the password
    const hashed = await bcrypt.hash(password, 10);

    // create the user
    const user = await User.create({ username, password: hashed });

    console.log(`New user registered: ${username}`);
    broadcastAllUsers();
    res.json({ success: true, username: user.username });

  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login
app.post("/login", express.json(), async (req, res) => {
  const { username, password } = req.body;

  try {
    // find the user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    // compare password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ error: "Wrong password" });
    }

    console.log(`${username} logged in`);
    res.json({ success: true, username: user.username, avatar: user.avatar || "" });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// create a raw HTTP server wrapping express
const server = http.createServer(app);

const wss = new WebSocketServer({ server });

const clients = new Map();


wss.on("connection", (ws) => {
  console.log("New client connected!");

  ws.on("message", (data) => {
  let parsed;

  try {
    parsed = JSON.parse(data.toString());
  } catch (e) {
    console.error("Invalid JSON received");
    return;
  }

  if (parsed.type === "join") {
    // Disconnect any old hanging socket for the same username to prevent duplicate presence
    clients.forEach((value, clientWs) => {
      if (clientWs !== ws && value.username === parsed.username) {
        console.log(`Closing duplicate old socket connection for ${parsed.username}`);
        try {
          clientWs.close();
        } catch (e) {
          console.error("Error closing old socket:", e);
        }
        clients.delete(clientWs);
      }
    });

    clients.set(ws, { username: parsed.username }); 
    console.log(`${parsed.username} joined`);
    console.log(`Total clients: ${clients.size}`);

    Message.find({ type: "message" })
    .sort({ timestamp: -1 })
    .limit(20)
    .then((history) => {
      if (history.length > 0) {
        ws.send(JSON.stringify({
          type: "history",
          messages: history.reverse(),
        }));
      }
    })
    .catch((err) => console.error("Error loading history:", err));

    ws.send(JSON.stringify({
    type: "users_list",
    users: getUsersList(),
  }));
  
  broadcastAllUsers();
  
    if(parsed.showNotification){
      broadcast(ws, {
        type: "notification",
        text: `${parsed.username} joined the chat`,
        timestamp: Date.now(),
      });
    }
    broadcastAll({
      type: "users_list",
      users: getUsersList(),
    });
}

if (parsed.type === "message") {
  const sender = clients.get(ws);
  console.log(`${sender.username}: ${parsed.text}`);

  const message = new Message({
    type: "message",
    username: sender.username,
    text: parsed.text,
    image: parsed.image || "",
    audio: parsed.audio || "",
    file: parsed.file || { data: "", name: "", type: "", size: 0 },
    timestamp: Date.now(),
    replyTo: parsed.replyTo || null,
  });

  message.save()
    message.save()
  .then(() => {
    console.log("Private message saved ✅");

    clients.forEach((value, clientWs) => {
      if (value.username === parsed.to && clientWs.readyState === 1) {
        
        // send to recipient
        clientWs.send(JSON.stringify({
          _id: message._id,
          type: "private_message",
          from: sender.username,
          to: parsed.to,
          text: parsed.text,
          image: message.image,
          audio: message.audio,
          file: message.file,
          timestamp: message.timestamp,
          replyTo: message.replyTo,
          readBy: message.readBy || [],
        }));

        // notify SENDER that message was delivered
        ws.send(JSON.stringify({
          type: "message_delivered",
          _id: message._id,
        }));
      }
    });
  })
    .catch((err) => console.error("Error saving message:", err));

  ws.send(JSON.stringify({
    _id: message._id,
    type: "message_sent",
    tempId: parsed.tempId,
    chatType: "message",
  }));
}

if (parsed.type === "private_message") {
  const sender = clients.get(ws);
  if (!sender) return;

  console.log(`Private: ${sender.username} → ${parsed.to}: ${parsed.text}`);

  const message = new Message({
    type: "private_message",
    from: sender.username,
    to: parsed.to,
    text: parsed.text,
    image: parsed.image || "",
    audio: parsed.audio || "",
    file: parsed.file || { data: "", name: "", type: "", size: 0 },
    timestamp: Date.now(),
    replyTo: parsed.replyTo || null,
  });

  message.save()
    .then(() => {
      console.log("Private message saved ✅");
      
      clients.forEach((value, clientWs) => {
        if (value.username === parsed.to && clientWs.readyState === 1) {
          clientWs.send(JSON.stringify({
            _id: message._id,
            type: "private_message",
            from: sender.username,
            to: parsed.to,
            text: parsed.text,
            image: message.image,
            audio: message.audio,
            file: message.file,
            timestamp: message.timestamp,
            replyTo: message.replyTo,
            readBy: message.readBy || [],
          }));
        }
      });
    })
    .catch((err) => console.error("Error saving private message:", err));

  ws.send(JSON.stringify({
    _id: message._id,
    type: "message_sent",
    tempId: parsed.tempId,
    chatType: "private_message",
  }));
}

if (parsed.type === "typing") {
  const sender = clients.get(ws);
  if (!sender) return;

  broadcast(ws, {
    type: "typing",
    username: sender.username,
  });
}

if (parsed.type === "visibility") {
  const client = clients.get(ws);
  if (client) {
    const isHidden = parsed.status === "hidden";
    clients.set(ws, { username: client.username, inactive: isHidden });
    
    if (isHidden) {
      User.updateOne({ username: client.username }, { lastActive: new Date() })
        .then(() => broadcastAllUsers())
        .catch((err) => console.error("Error updating lastActive on hide:", err));
    } else {
      broadcastAllUsers();
    }

    broadcastAll({
      type: "users_list",
      users: getUsersList(),
    });
  }
}

if (parsed.type === "logout") {
  const client = clients.get(ws);
  if (client) {
    broadcast(ws, {
      type: "notification",
      text: `${client.username} left the chat`,
      timestamp: Date.now(),
    });
    clients.delete(ws);
    broadcastAll({
      type: "users_list",
      users: getUsersList(),
    });
    User.updateOne({ username: client.username }, { lastActive: new Date() })
      .then(() => broadcastAllUsers())
      .catch((err) => console.error("Error updating lastActive on logout:", err));
  }
}
if (parsed.type === "mark_read") {
  const reader = clients.get(ws);
  if (!reader) return;
  console.log(`🔵 mark_read: ${reader.username} read messages from ${parsed.chatWith}`);

  Message.updateMany(
    {
      type: "private_message",
      to: reader.username,
      from: parsed.chatWith,
      readBy: { $ne: reader.username }
    },
    { $push: { readBy: reader.username } }
  ).then((result) => {
    console.log(`🔵 Updated ${result.modifiedCount} messages as read`);

    clients.forEach((value, clientWs) => {
      console.log(`🔵 Checking client: ${value.username} === ${parsed.chatWith}`); 
      if (value.username === parsed.chatWith && clientWs.readyState === 1) {
        console.log(`🔵 Notifying ${parsed.chatWith} that messages were read`); 
        clientWs.send(JSON.stringify({
          type: "messages_read",
          by: reader.username,
          chatWith: parsed.chatWith,
        }));  
      }
    });
  }).catch((err) => console.error("Mark read error:", err));
}

});

  ws.on("close", () => {
    const client = clients.get(ws);

    if (client) {
      console.log(`${client.username} left`);

      broadcast(ws, {
        type: "notification",
        text: `${client.username} left the chat`,
        timestamp: Date.now(),
      });

      clients.delete(ws);
      broadcastAll({
        type: "users_list",
        users: getUsersList(),
      });
      User.updateOne({ username: client.username }, { lastActive: new Date() })
        .then(() => broadcastAllUsers())
        .catch((err) => console.error("Error updating lastActive on close:", err));
    }
  });
});

function broadcast(senderWs, message) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client   !== senderWs && client.readyState === 1) {
      client.send(data);
    }
  });
}
function broadcastAll(message) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

function getUsersList() {
  const users = [];
  clients.forEach((value) => {
    if (!value.inactive) {
      users.push(value.username);
    }
  });
  return users;
}

async function broadcastAllUsers() {
  try {
    const registeredUsers = await User.find({}, "username lastActive createdAt avatar");
    const usersData = registeredUsers.map((u) => ({
      username: u.username,
      lastActive: (u.lastActive || u.createdAt || new Date()).getTime(),
      avatar: u.avatar || "",
    }));
    broadcastAll({
      type: "all_users_list",
      users: usersData,
    });
  } catch (err) {
    console.error("Error fetching all users:", err);
  }
}

// Update user profile picture (avatar)
app.post("/user/avatar", express.json({ limit: "10mb" }), async (req, res) => {
  const { username, avatar } = req.body;

  try {
    const user = await User.findOneAndUpdate({ username }, { avatar }, { new: true });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    console.log(`Avatar updated for: ${username}`);
    await broadcastAllUsers();
    res.json({ success: true, avatar: user.avatar });
  } catch (err) {
    console.error("Avatar update error:", err);
    res.status(500).json({ error: "Failed to update avatar" });
  }
});

app.get("/history/group", async (req, res) => {
  const { before } = req.query;

  try {
    const query = { type: "message" };

    // if before timestamp provided, get messages older than that
    if (before) {
      query.timestamp = { $lt: Number(before) };
    }

    const messages = await Message.find(query)
      .sort({ timestamp: -1 }) // newest first
      .limit(20);

    res.json(messages.reverse()); // send oldest first
  } catch (err) {
    console.error("Error loading group history:", err);
    res.status(500).json({ error: "Failed to load history" });
  }
});
// Edit message
app.patch("/message/:id", express.json(), async (req, res) => {
  const { id } = req.params;
  const { text, username } = req.body;

  try {
    const message = await Message.findById(id);

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // only the sender can edit
    if (message.username !== username && message.from !== username) {
      return res.status(403).json({ error: "Not allowed" });
    }

    message.text = text;
    message.edited = true;
    await message.save();

    // broadcast the edit to everyone
    broadcastAll({
      type: "message_edited",
      _id: id,
      text: text,
      chatType: message.type,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Edit error:", err);
    res.status(500).json({ error: "Failed to edit message" });
  }
});

// Delete message
app.delete("/message/:id", express.json(), async (req, res) => {
  const { id } = req.params;
  const { username } = req.body;

  try {
    const message = await Message.findById(id);

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // only the sender can delete
    if (message.username !== username && message.from !== username) {
      return res.status(403).json({ error: "Not allowed" });
    }

    await Message.findByIdAndDelete(id);

    // broadcast the delete to everyone
    broadcastAll({
      type: "message_deleted",
      _id: id,
      chatType: message.type,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Failed to delete message" });
  }
});


app.use(express.static(path.join(__dirname, "../client/dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist", "index.html"));
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
