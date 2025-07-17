import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import connectDB from './configs/mongodb.js'
import { clerkWebhooks, stripeWebhooks } from './controllers/webhooks.js'
import educatorRouter from './routes/educatorRoutes.js'
import { clerkMiddleware } from '@clerk/express'
import connectCloudinary from './configs/cloudinary.js'
import courseRouter from './routes/courseRoute.js'
import userRouter from './routes/userRoutes.js'

const app = express()

await connectDB()
await connectCloudinary()
app.use(cors({
  origin: [process.env.FRONTEND_URL], // allow these origins
  credentials: true, // if using cookies
}));
app.use(cors({
  origin: 'https://tech-universe-seven.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(clerkMiddleware())

app.get('/', (req, res) => res.send("API Working perfectly...."))

app.post('/clerk', express.json(), clerkWebhooks)

app.use(express.json())

app.use('/api/educator', educatorRouter)
app.use('/api/course', courseRouter)
app.use('/api/user', userRouter)

app.post('/stripe', express.raw({ type: 'application/json' }), stripeWebhooks)
  
const PORT = process.env.PORT || 5080
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
