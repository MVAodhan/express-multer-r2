const express = require('express');
const multer = require('multer');
require('dotenv').config();
const cors = require('cors');

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const uuid = require('uuid').v4;
const sharp = require('sharp');

const bucketName = process.env.CLOUDFLARE_BUCKET_NAME;
const cloudflareEndpoint = process.env.CLOUDFLARE_API_ENDPOINT;
const cloudflareAccessKey = process.env.CLOUDFLARE_ACCESS_KEY;
const cloudflareSecretKey = process.env.CLOUDFLARE_SECRET_KEY;
const port = process.env.PORT;
// connecting to cloudflare r2 with s3 sdk
const s3 = new S3Client({
  region: 'auto',
  endpoint: cloudflareEndpoint,
  credentials: {
    accessKeyId: cloudflareAccessKey,
    secretAccessKey: cloudflareSecretKey,
  },
});
const randomImageName = (origionalname) => {
  const name = `${uuid()}-${origionalname}`;
  return name;
};

const corsOptions = {
  origin: ['http://localhost:3000', 'http://localhost:3001'],
};
const app = express();
app.use(cors(corsOptions));

// Store file in memory to transform and validate before sending to S3
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.split('/')[0] === 'image') {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE'), false);
  }
};
const upload = multer({
  storage,
  fileFilter,
  // limits: { fileSize: 70000, files: 2 },
});
const getSignedObject = async (key) => {
  const getObjectParams = {
    Bucket: bucketName,
    Key: key,
  };
  const command = new GetObjectCommand(getObjectParams);
  const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
  return url;
};

app.get('/', async (req, res) => {
  const posts = await prisma.posts.findMany();
  for (const post of posts) {
    post.imageName = await getSignedObject(post.imageName);
  }
  res.send(posts);
});

app.post('/upload', upload.single('image'), async (req, res) => {
  const file = req.file;
  const caption = req.body.caption;
  const imageName = randomImageName(file.originalname);
  const fileBuffer = await sharp(file.buffer)
    .resize(1080, 1920, { fit: 'contain' })
    .toBuffer();
  const params = {
    Bucket: bucketName,
    Key: imageName,
    Body: fileBuffer,
    ContentType: file.mimetype,
  };
  const command = new PutObjectCommand(params);
  await s3.send(command);

  const post = await prisma.posts.create({
    data: {
      imageName,
      caption,
    },
  });

  res.json({ message: 'success' });
});

app.delete('/deletePost/:id', async (req, res) => {
  let { id } = req.params;
  id = parseInt(id);

  const post = await prisma.posts.findUnique({
    where: {
      id: id,
    },
  });

  const params = {
    Bucket: bucketName,
    Key: post.imageName,
  };

  await s3.send(new DeleteObjectCommand(params));

  await prisma.posts.delete({
    where: {
      id: id,
    },
  });
});
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.json({
        message: 'file is too large',
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.json({
        message: 'TOO MANY FILES',
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.json({
        message: 'Unexpected File',
      });
    }
  }
});

app.listen(port, () => {
  console.log(`app listening on port ${port}`);
});
