const { faker } = require("@faker-js/faker");
const mysql = require("mysql2");
const express = require("express");
const multer = require("multer");
const app = express();
const port = 8080;
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const methodOverride = require("method-override");
const randomstring = require("randomstring");

app.use(methodOverride("_method"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// (First version, kept for reference — the app now runs from index.mjs.)
const connection = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  database: process.env.DB_NAME || "insta_post",
  password: process.env.DB_PASSWORD || "",
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "public", "uploads"));
  },
  filename: function (req, file, cb) {
    cb(null, uuidv4() + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

// Multer configuration for handling file uploads

// const storage = multer.memoryStorage();
// const upload = multer({ storage: storage });

// Imgur API endpoint
const IMGUR_UPLOAD_URL = "https://api.imgur.com/3/image";

// Imgur API credentials come from the environment (see .env.example)
const IMGUR_CLIENT_ID = process.env.IMGUR_CLIENT_ID || "";

let posts = [
  {
    id: uuidv4(),
    username: "@Abhi94",
    name: "Abhay",
    image:
      "https://dm0qx8t0i9gc9.cloudfront.net/thumbnails/image/rDtN98Qoishumwih/storyblocks-green-leaves-on-orange-sunrise-background-nature-outdoor-evening-photo-in-forest_SApn0qxLz_thumb.jpg",
    comment: "This is my first post.",
  },
  {
    id: uuidv4(),
    username: "@94",
    name: "Abhi",
    image:
      "https://insertface.com/fb/834/car-background-wallpaper-833608-u46a8-fb.jpg",
    comment: "This is Abhi here.",
  },
  {
    id: uuidv4(),
    username: "@ME",
    name: "ME",
    image:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT0iwXTqhBgBwEwCsecTIh-2PRpoxtXqLu8M2b9ZUF-dA&s",
    comment: "This is Me.",
  },
];

let getRandomUser = () => {
  return [
    faker.string.uuid(),
    faker.internet.userName(),
    faker.internet.userName(),
    faker.image.avatar(),
    randomstring.generate(),
  ];
};
let users = [];
for (let i = 1; i <= 3; i++) {
  users.push(getRandomUser());
}

for (let i = 1; i <= 3; i++) {
  users.push(getRandomUser());
}
let q = "INSERT INTO instauser (id, username, name, image, comment) VALUES ?";
connection.query(q, [users], (err, result) => {
  if (err) {
    console.error(err);
    throw err;
  } else {
    console.log("Some Error in database1");
  }
});
connection.end();

app.get("/posts", (req, res) => {
  let q = `SELECT * FROM instauser`;
  try {
    connection.query(q, (err, results) => {
      const plainObjects = JSON.parse(JSON.stringify(results));
      // console.log(plainObjects);
      res.render("index.ejs", { results: plainObjects });
    })
  }
  catch (err) {
    console.log(err);
    res.send("Some Error in database");
  }

});

app.get("/posts/new", (req, res) => {
  res.render("new.ejs");
});

app.post("/posts", upload.single("image"), (req, res) => {
  let { username, name, comment } = req.body;
  let image = req.file ? `/uploads/${req.file.filename}` : "";
  let id = faker.string.uuid();
  let q = `INSERT INTO instauser VALUES ("${id}", "${username}", "${name}", "${image}", "${comment}")`;
  posts.push({ id, username, name, image, comment });

  try {
    connection.query(q, (err, result) => {
      if (err) {
        console.log(err);
        res.send("DB Error2");
      } else {
        res.redirect("/posts");
      }
    });
  } catch (err) {
    console.log(err);
    res.send("DB Error3");
  }
});

app.post("/posts", upload.single("image"), async (req, res) => {
  console.log(req.file);
  let { username, name, comment } = req.body;
  let image = req.file; // The uploaded file object
  let id = uuidv4();

  // Upload the image to Imgur
  const formData = new FormData();
  formData.append("image", image.buffer.toString("base64"));

  try {
    const response = await fetch(IMGUR_UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: `Client-ID ${IMGUR_CLIENT_ID}`,
      },
      body: formData,
    });

    const data = await response.json();

    if (data.success) {
      const imageUrl = data.data.link;

      // Insert the record into the database with the image URL
      let q = `INSERT INTO instauser VALUES ("${id}", "${username}", "${name}", "${imageUrl}", "${comment}")`;
      connection.query(q, (err, result) => {
        if (err) {
          console.error(err);
          res.send("DB Error4");
        } else {
          res.redirect("/posts");
        }
      });
    } else {
      console.error(data);
      res.send("Upload failed");
    }
  } catch (error) {
    console.error(error);
    res.send("Upload failed");
  }
});

app.get("/posts/:id", (req, res) => {
  let { id } = req.params;
  console.log(id);
  let post = posts.find((p) => id === p.id);
  res.render("show.ejs", { post });
});

app.get("/posts/:id/edit", (req, res) => {
  let { id } = req.params;
  let q = `SELECT * FROM instauser WHERE id="${id}"`;

  try {
    connection.query(q, (err, result) => {
      const post = JSON.parse(JSON.stringify(result[0]));
      res.render("edit.ejs", { post });
      // console.log(post);
    });
  } catch {
    console.log(err);
    res.send("Error in finding the User");
  }
});

app.patch("/posts/:id", upload.single("image"), (req, res) => {
  let { id } = req.params;
  let newComment = req.body.comment;
  let newImage = req.file ? `/uploads/${req.file.filename}` : "";
  if (newComment != "") {
    let updateComment = `UPDATE instauser SET comment="${newComment}" WHERE id="${id}"`;
    connection.query(updateComment, (error, result) => {
      // console.log("Updated Comment");
    });
  }

  if (newImage != "") {
    let updateImage = `UPDATE instauser SET image="${
      req.file ? `/uploads/${req.file.filename}` : ""
    }" WHERE id="${id}"`;
    connection.query(updateImage, (err, result) => {
      // console.log("Updated Image");
    });
  }

  // console.log(post);
  res.redirect("/posts");
});

app.patch("/posts/:id", upload.single("image"), async (req, res) => {
  let { id } = req.params;
  let newComment = req.body.comment;
  let newImage = req.file; // The new uploaded image, if provided

  try {
    // If a new image is provided, upload it to Imgur
    let imageUrl = "";
    if (newImage) {
      const formData = new FormData();
      formData.append("image", newImage.buffer.toString("base64"));

      const response = await fetch(IMGUR_UPLOAD_URL, {
        method: "POST",
        headers: {
          Authorization: `Client-ID ${IMGUR_CLIENT_ID}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        imageUrl = data.data.link;
      } else {
        console.error(data);
        res.send("Upload failed");
        return; // Exit early if image upload fails
      }
    }

    // Update the post in the database with the new comment and/or image URL
    let updateQuery = `UPDATE instauser SET `;
    if (newComment) {
      updateQuery += `comment="${newComment}"`;
    }
    if (newImage) {
      if (newComment) updateQuery += ", "; // Add comma if both comment and image are updated
      updateQuery += `image="${imageUrl}"`;
    }
    updateQuery += ` WHERE id="${id}"`;

    connection.query(updateQuery, (error, result) => {
      if (error) {
        console.error(error);
        res.send("DB Error5");
      } else {
        res.redirect("/posts");
      }
    });
  } catch (error) {
    console.error(error);
    res.send("Upload failed");
  }
});

app.delete("/posts/:id", (req, res) => {
  let { id } = req.params;
  let deletePost = `DELETE FROM instauser WHERE id="${id}"`;
  connection.query(deletePost, (req, res) => {
    // console.log("DEleted post")
  });
  res.redirect("/posts");
});

app.post("/upload", upload.single('image'), (req, res) => {
  // Send the filename of the uploaded image back to the client
  res.send(req.file.filename);
});

app.listen(port, () => {
  console.log(`Listening to port - ${port}`);
});