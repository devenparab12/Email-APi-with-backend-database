require("dotenv").config();

const express = require("express");
const nodemailer = require("nodemailer");
const mysql = require("mysql2/promise");
const basicAuth = require('basic-auth');
const path = require("path");
const app = express();
const PORT = 3000;
express.static.mimeTypes = null;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Middleware for Basic Authentication
app.use((req, res, next) => {
    const user = basicAuth(req);

    // Replace 'your_username' and 'your_password' with your actual credentials
    if (!user || user.name !== process.env.user || user.pass !== process.env.password) {
        res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
        return res.status(401).send('Unauthorized');
    }

    next();
});


// Configure NodeMailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Check MySQL connection and existing data
const checkMySQLConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log("Connected to MySQL Server!");

    // Check for existing data
    const [rows] = await connection.execute("SELECT * FROM emails LIMIT 100");
    if (rows.length > 0) {
      console.log("Existing data found in the database:");
      console.table(rows); // Print the existing data in tabular format
    } else {
      console.log("No existing data in the database.");
    }

    connection.release(); // Release the connection after checking
  } catch (error) {
    console.error("Error connecting to MySQL:", error);
    process.exit(1); // Exit the application if the connection fails
  }
};

// Check MySQL connection and existing data before starting the server
checkMySQLConnection();
// Define route for sending emails and saving to MySQL
app.post("/send-email", async (req, res) => {
  const { to, subject, text } = req.body;

  // Save to MySQL
  try {
    const connection = await pool.getConnection();
    await connection.execute(
      "INSERT INTO emails (to_address, subject, body) VALUES (?, ?, ?)",
      [to, subject, text]
    );
    connection.release();
    console.log("Data saved to MySQL:", { to, subject, text });
  } catch (error) {
    console.error("Error saving to MySQL:", error);
    return res.status(500).send("Error saving to MySQL");
  }

  // Send email
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
      return res.status(500).send("Error sending email");
    }
    res
      .status(200)
      .send(`Email sent and saved to Database`);
  });
});
                 
// Define route for deleting emails from MySQL
app.get("/delete-email/:id", async (req, res) => {
  console.log("Hii");
  const emailId = req.params.id;

  // Delete from MySQL
  try {
    const connection = await pool.getConnection();
    await connection.execute(
      "DELETE FROM emails WHERE id = ?",
      [emailId]
    );
    connection.release();
    console.log("Email deleted from MySQL with ID:", emailId);
    res.status(200).send("Email deleted from MySQL");
  } catch (error) {
    console.error("Error deleting email from MySQL:", error);
    return res.status(500).send("Error deleting email from MySQL");
  }
});
// Define route for printing emails
app.get("/print-email/:id", async (req, res) => {
  const emailId = req.params.id;

  // Fetch email details from MySQL
  let emailDetails;
  try {
    const connection = await pool.getConnection();
    [emailDetails] = await connection.execute(
      "SELECT * FROM emails WHERE id = ?",
      [emailId]
    );
    connection.release();
  } catch (error) {
    console.error("Error fetching email details:", error);
    return res.status(500).send("Error fetching email details");
  }

  // Print email details
  console.log("Email details:", emailDetails[0]);
  res.status(200).send("Email details printed in the console");
});

app.get('/sent-emails', async (req, res) => {
  try {
      const connection = await pool.getConnection();
      const [rows] = await connection.query('SELECT * FROM emails');
      res.json(rows);
      connection.release();
  } catch (error) {
      console.error('Error fetching sent emails:', error);
      res.status(500).json({ error: 'Error fetching sent emails' });
  }
});

// Serve the HTML file
app.use(express.static(path.join(__dirname, 'public')));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"))
});
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
