import User from "../models/User.js";
import { clerkClient } from "@clerk/express";
import stripe from "stripe";
import { Purchase } from "../models/Purchase.js";
import Course from "../models/Course.js";
import e from "express";

export const getUserData = async (req, res) => {
  try {
    const userId = req.auth.userId;

    // Get user from Clerk
    const clerkUser = await clerkClient.users.getUser(userId);

    // Get user from our database using Clerk ID as _id
    const dbUser = await User.findById(userId).populate(
      "enrolledCourses",
      "courseTitle courseThumbnail"
    );

    if (!dbUser) {
      // Create user if doesn't exist
      const newUser = await User.create({
        _id: userId, // Use Clerk ID as _id
        name: `${clerkUser.firstName} ${clerkUser.lastName}`,
        email: clerkUser.emailAddresses[0].emailAddress,
        imageUrl: clerkUser.imageUrl,
      });

      return res.json({
        success: true,
        user: {
          ...newUser.toObject(),
          isEducator: clerkUser.publicMetadata?.role === "educator",
        },
      });
    }

    res.json({
      success: true,
      user: {
        ...dbUser.toObject(),
        isEducator: clerkUser.publicMetadata?.role === "educator",
      },
    });
  } catch (error) {
    console.error("Error getting user data:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get All Educators
export const getAllEducators = async (req, res) => {
  try {
    // Get all users with the 'educator' role from Clerk
    const educators = await User.find({
      role: "educator"
    }).select("_id name email imageUrl role");

    if (!educators || educators.length === 0) {
      return res.json({
        success: true,
        educators: [],
        count: 0,
        message: "No educators found",
      });
    }
    res.json({
      success: true,
      educators,
      count: educators.length,
    });
  } catch (error) {
    console.error("Error fetching all educators:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const userEnrolledCourses = async (req, res) => {
  try {
    const userId = req.auth.userId;

    const user = await User.findById(userId).populate({
      path: "enrolledCourses",
      select: "courseTitle courseThumbnail educator courseDescription",
      populate: {
        path: "educator",
        select: "name",
      },
    });
    console.log({user})

    if (!user) {
      return res.json({
        success: true,
        enrolledCourses: [],
      });
    }

    res.json({
      success: true,
      enrolledCourses: user.enrolledCourses || [],
    });
  } catch (error) {
    console.error("Error fetching enrolled courses:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const purchaseCourse = async (req, res) => {
  try {
    const { courseId } = req.body;
    const userId = req.auth.userId;
    // Validate course exists
    const course = await Course.findById(courseId).select(
      "courseTitle coursePrice"
    );
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }
    // Check existing enrollment (more robust check)
    const [existingPurchase, user] = await Promise.all([
      Purchase.findOne({ userId, courseId, status: "completed" }),
      User.findById(userId).select("enrolledCourses email"),
    ]);
    const isEnrolled =
      existingPurchase || user?.enrolledCourses?.includes(courseId);

    if (isEnrolled) {
      return res.status(200).json({
        success: true,
        isAlreadyEnrolled: true,
        message: "You already have access to this course",
        course: {
          _id: courseId,
          title: course.courseTitle,
        },
      });
    }

    // Check for pending purchase
    const pendingPurchase = await Purchase.findOne({
      userId,
      courseId,
      status: "pending",
    });
    if (pendingPurchase) {
      const stripeInstance = stripe(process.env.STRIPE_SECRET_KEY);
      const session = await stripeInstance.checkout.sessions.retrieve(
        pendingPurchase.sessionId
      );

      return res.json({
        success: true,
        session_url: session.url,
        isPending: true,
      });
    }
    // Create new Stripe session
    const stripeInstance = stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripeInstance.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: user.email, // From auth middleware
      line_items: [
        {
          price_data: {
            currency: "bdt",
            product_data: {
              name: course.courseTitle,
              metadata: {
                courseId: courseId.toString(),
              },
            },
            unit_amount: Math.round(course.coursePrice * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.FRONTEND_URL}/courses/${courseId}?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/courses/${courseId}?payment=cancel`,
      metadata: {
        userId,
        courseId,
        purchaseType: "course",
      },
    });

    // Create purchase record
    await Purchase.create({
      userId,
      courseId,
      amount: course.coursePrice,
      status: "pending",
      sessionId: session.id,
    });

    res.json({
      success: true,
      session_url: session.url,
    });
  } catch (error) {
    console.error("Purchase error:", error);
    res.status(500).json({
      success: false,
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Payment processing failed",
    });
  }
};

export const updateCourseProgress = async (req, res) => {
  try {
    const { courseId, progress } = req.body;
    const userId = req.auth.userId;

    await User.findOneAndUpdate(
      { _id: userId, "enrolledCourses.courseId": courseId },
      { $set: { "enrolledCourses.$.progress": progress } },
      { new: true }
    );

    res.json({
      success: true,
      message: "Progress updated",
    });
  } catch (error) {
    console.error("Error updating progress:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getUserCourseProgress = async (req, res) => {
  try {
    const { courseId } = req.params; // Changed from req.body to req.params
    const userId = req.auth.userId;

    const user = await User.findOne({
      _id: userId,
      enrolledCourses: { $elemMatch: { courseId } },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Course not found in user's enrollments",
      });
    }

    const courseProgress = user.enrolledCourses.find(
      (course) => course.courseId.toString() === courseId
    ).progress;

    res.json({
      success: true,
      progress: courseProgress || 0,
    });
  } catch (error) {
    console.error("Error getting progress:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const addUserRating = async (req, res) => {
  try {
    const { courseId, rating, review } = req.body;
    const userId = req.auth.userId;

    // Check if user is enrolled
    const isEnrolled = await Purchase.exists({
      userId,
      courseId,
      status: "completed",
    });

    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: "You must enroll before rating",
      });
    }

    // Add rating to course
    await Course.findByIdAndUpdate(courseId, {
      $push: {
        ratings: {
          user: userId,
          rating,
          review,
          createdAt: new Date(),
        },
      },
      $inc: { totalRatings: 1 },
    });

    res.json({
      success: true,
      message: "Rating added successfully",
    });
  } catch (error) {
    console.error("Error adding rating:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
