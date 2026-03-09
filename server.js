const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;
const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 3;
const DB_PATH = path.join(__dirname, "db.json");

app.use(express.json());
app.use(express.static(__dirname));

function defaultDb() {
  return { users: [], otpSessions: [] };
}

function readDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb(), null, 2), "utf8");
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return defaultDb();
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

function safeUser(user) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    country: user.country,
    countryAr: user.countryAr,
    governorate: user.governorate,
    email: user.email,
    phone: user.phone || ""
  };
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateName(name) {
  return typeof name === "string" && name.trim().length >= 3 && !/\d/.test(name);
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 999999)}`;
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = String(process.env.SMTP_SECURE || "false") === "true";
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
}

async function sendOtpEmail(to, code) {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.");
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await transporter.sendMail({
    from,
    to,
    subject: "Your verification code",
    text: `Your verification code is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes. You have ${OTP_MAX_ATTEMPTS} attempts.`
  });
}

app.post("/api/auth/start", async (req, res) => {
  try {
    const { mode, role, email, password, name, country, countryAr, governorate } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!["register", "login"].includes(mode)) return res.status(400).json({ error: "Invalid mode." });
    if (!["student", "provider"].includes(role)) return res.status(400).json({ error: "Invalid role." });
    if (!validateEmail(normalizedEmail)) return res.status(400).json({ error: "Invalid email." });
    if (String(password || "").length < 7) return res.status(400).json({ error: "Invalid password." });

    const db = readDb();
    let pendingUser = null;
    const existingUser = db.users.find((u) => u.email === normalizedEmail);

    if (mode === "register") {
      if (existingUser) return res.status(400).json({ errorCode: "EMAIL_EXISTS" });
      if (!validateName(String(name || ""))) return res.status(400).json({ error: "Invalid name." });
      if (!country || !countryAr || !governorate) return res.status(400).json({ error: "Missing location fields." });
      const passwordHash = await bcrypt.hash(password, 10);
      pendingUser = {
        id: generateId("u"),
        role,
        name: String(name).trim(),
        country,
        countryAr,
        governorate,
        email: normalizedEmail,
        passwordHash,
        phone: ""
      };
    } else {
      if (!existingUser) return res.status(400).json({ errorCode: "LOGIN_INVALID" });
      const passwordOk = await bcrypt.compare(password, existingUser.passwordHash);
      if (!passwordOk) return res.status(400).json({ errorCode: "LOGIN_INVALID" });
      if (existingUser.role !== role) return res.status(400).json({ errorCode: "ROLE_MISMATCH" });
    }

    db.otpSessions = db.otpSessions.filter((s) => !(s.email === normalizedEmail && !s.isVerified));
    const otpCode = generateOtpCode();
    const session = {
      id: generateId("otp"),
      mode,
      role,
      email: normalizedEmail,
      otpHash: sha256(otpCode),
      attemptsLeft: OTP_MAX_ATTEMPTS,
      expiresAt: Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
      isVerified: false,
      userId: existingUser ? existingUser.id : null,
      pendingUser
    };
    db.otpSessions.push(session);
    writeDb(db);

    await sendOtpEmail(normalizedEmail, otpCode);
    res.json({ otpSessionId: session.id, expiresInMinutes: OTP_EXPIRY_MINUTES, attempts: OTP_MAX_ATTEMPTS });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to start auth." });
  }
});

app.post("/api/auth/resend", async (req, res) => {
  try {
    const { otpSessionId } = req.body || {};
    const db = readDb();
    const session = db.otpSessions.find((s) => s.id === otpSessionId && !s.isVerified);
    if (!session) return res.status(400).json({ error: "Session not found." });

    const code = generateOtpCode();
    session.otpHash = sha256(code);
    session.attemptsLeft = OTP_MAX_ATTEMPTS;
    session.expiresAt = Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000;
    writeDb(db);

    await sendOtpEmail(session.email, code);
    res.json({ message: "Code resent.", expiresInMinutes: OTP_EXPIRY_MINUTES, attempts: OTP_MAX_ATTEMPTS });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to resend code." });
  }
});

app.post("/api/auth/verify", async (req, res) => {
  try {
    const { otpSessionId, code } = req.body || {};
    const db = readDb();
    const session = db.otpSessions.find((s) => s.id === otpSessionId && !s.isVerified);
    if (!session) return res.status(400).json({ errorCode: "OTP_EXPIRED" });
    if (!/^\d{6}$/.test(String(code || ""))) return res.status(400).json({ errorCode: "OTP_REQUIRED" });
    if (Date.now() > session.expiresAt) return res.status(400).json({ errorCode: "OTP_EXPIRED" });
    if (session.attemptsLeft <= 0) return res.status(400).json({ errorCode: "OTP_LOCKED" });

    if (sha256(String(code)) !== session.otpHash) {
      session.attemptsLeft = Math.max(0, session.attemptsLeft - 1);
      writeDb(db);
      return res.status(400).json({ errorCode: "OTP_INVALID", attemptsLeft: session.attemptsLeft });
    }

    let user;
    if (session.mode === "register") {
      db.users.push(session.pendingUser);
      user = session.pendingUser;
    } else {
      user = db.users.find((u) => u.id === session.userId);
    }

    session.isVerified = true;
    writeDb(db);
    res.json({ user: safeUser(user), mode: session.mode });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to verify code." });
  }
});

app.post("/api/users/phone", (req, res) => {
  try {
    const { userId, phone } = req.body || {};
    const value = String(phone || "").trim();
    if (!userId) return res.status(400).json({ error: "Missing userId." });
    if (value && !/^\+?\d{7,15}$/.test(value)) return res.status(400).json({ error: "Invalid phone." });

    const db = readDb();
    const user = db.users.find((u) => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found." });
    user.phone = value;
    writeDb(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to save phone." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
