import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    _id: { type: String }, // No longer required, will use Clerk ID
    name: { type: String, required: true },
    email: { type: String, required: true },
    imageUrl: { type: String, required: true },
    enrolledCourses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course'
      }
    ],
  }, 
  { 
    timestamps: true,
    // Add this to prevent Mongoose from creating _id when we provide our own
    _id: false 
  }
);

const User = mongoose.model('User', userSchema);

export default User;