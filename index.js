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
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const uuid = require('uuid').v4;
const sharp = require('sharp');

// const bucketName = process.env.AWS_BUCKET_NAME;
const region = process.env.AWS_BUCKET_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY;
const secretAccessKey = process.env.AWS_SECRET_KEY;

const bucketName = process.env.CLOUDFLARE_BUCKET_NAME;
const cloudflareEndpoint = process.env.CLOUDFLARE_API_ENDPOINT;
const cloudflareAccessKey = process.env.CLOUDFLARE_ACCESS_KEY;
const cloudflareSecretKey = process.env.CLOUDFLARE_SECRET_KEY;

// Connecting to s3 bucket
// const s3 = new S3Client({
//   region,
//   credentials: {
//     accessKeyId,
//     secretAccessKey,
//   },
// });

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

// storing in a single location wi no options, check line 33 for implimentation with options
// const upload = multer({ dest: './uploads/' });

var corsOptions = {
  origin: 'http://localhost:3000',
};
const app = express();
app.use(cors(corsOptions));
//single file upload
// app.post('/upload', upload.single('file'), (req, res) => {
//   res.json({ status: 'success' });
// });

// multiple file upload
// app.post('/upload', upload.array('file', 2), (req, res) => {
//   res.json({ status: 'success' });
// });

//multiple fields
// const multiUpload = upload.fields([
//   { name: 'avatar', maxCount: 1 },
//   { name: 'resume', maxCount: 1 },
// ]);

// app.post('/upload', multiUpload, (req, res) => {
//   res.json({ status: 'success' });
// });

// Store File on disk in node server
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, 'uploads');
//   },
//   filename: function (req, file, cb) {
//     const { originalname } = file;
//     cb(null, `${uuid()}-${originalname}`);
//   },
// });

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

// app.get('/', async (req, res) => {
//   const getObjectParams = {
//     Bucket: bucketName,
//     Key: '',
//   };
//   const command = new GetObjectCommand(getObjectParams);
//   const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
//   res.send(JSON.stringify('Hello express multer'));
// });

app.get('/', async (req, res) => {
  res.json({
    message: 'server active',
  });
});

app.post('/upload', upload.single('file'), async (req, res) => {
  const transformedBuffer = await sharp(req.file.buffer)
    .resize(1080, 1920, { fit: 'contain' })
    .toBuffer();
  const params = {
    Bucket: bucketName,
    Key: randomImageName(req.file.originalname),
    Body: transformedBuffer,
    ContentType: req.file.mimetype,
  };
  const command = new PutObjectCommand(params);
  await s3.send(command);

  res.json({ message: 'success' });
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

app.listen(8888, () => {
  console.log('app listening on port 8888');
});
