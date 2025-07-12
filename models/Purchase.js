import mongoose from "mongoose";

const PurchaseSchema = new mongoose.Schema({
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true,
        index: true
    },
    userId: {
        type: String, // Matches User._id (Clerk ID)
        ref: 'User',
        required: true,
        index: true
    },
    amount: {
        type: Number, 
        required: true,
        min: 0
    },
    status: {
        type: String, 
        enum: ['pending', 'completed', 'failed', 'refunded'], 
        default: 'pending',
        index: true
    },
    sessionId: {
        type: String,
        unique: true,
        sparse: true
    },
    paymentMethod: String,
    receiptUrl: String
}, {
    timestamps: true,
    // Compound index for faster queries
    indexes: [
        { userId: 1, courseId: 1, unique: true }
    ]
});

export const Purchase = mongoose.model('Purchase', PurchaseSchema);