import { clerkClient } from "@clerk/express";
import Course from "../models/Course.js";
import { v2 as cloudinary } from "cloudinary";
import { Purchase } from "../models/Purchase.js";
import User from "../models/User.js";

// Update role to educator
export const updateRoleToEducator = async (req, res) => {
  try {
    const userId = req.auth.userId;

    // First check if user is already an educator
    const user = await clerkClient.users.getUser(userId);
    if (user.publicMetadata?.role === "educator") {
      return res.json({
        success: true,
        isEducator: true,
        message: "User is already an educator",
      });
    }

    await clerkClient.users.updateUser(userId, {
      publicMetadata: {
        role: "educator", // Fixed typo from 'educator' to 'educator'
      },
    });

    res.json({
      success: true,
      isEducator: true,
      message: "You can publish courses now",
    });
  } catch (error) {
    console.error("Error updating role:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Check educator role
export const checkEducatorRole = async (req, res) => {
  try {
    const userId = req.auth.userId;
    const user = await clerkClient.users.getUser(userId);

    const isEducator = user.publicMetadata?.role === "educator";

    res.json({
      success: true,
      isEducator,
    });
  } catch (error) {
    console.error("Error checking educator role:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Add New Course
export const addCourse = async (req, res) => {
  try {
    const { courseData } = req.body;
    console.log({courseData});
    const imageFile = req.file;
    const educatorId = req.auth.userId;

    if (!imageFile) {
      return res.status(400).json({
        success: false,
        message: "Course thumbnail is required",
      });
    }

    const parsedCourseData = JSON.parse(courseData);
    parsedCourseData.educator = educatorId;

    // Upload thumbnail to Cloudinary
    const imageUpload = await cloudinary.uploader.upload(imageFile.path, {
      folder: "course-thumbnails",
      quality: "auto:good",
    });

    parsedCourseData.courseThumbnail = {
      url: imageUpload.secure_url,
      publicId: imageUpload.public_id,
    };
    // console.log(parsedCourseData);
    const newCourse = await Course.create(parsedCourseData);

    res.status(201).json({
      success: true,
      message: "Course created successfully",
      courseId: newCourse._id,
    });
  } catch (error) {
    console.error("Error adding course:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get Educator Courses
export const getEducatorCourses = async (req, res) => {
  try {
    const educatorId = req.auth.userId;
    const courses = await Course.find({ educator: educatorId })
      .sort({ createdAt: -1 })
      .select("-__v");

    res.json({
      success: true,
      courses,
      count: courses.length,
    });
  } catch (error) {
    console.error("Error fetching educator courses:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Educator Dashboard Data
export const educatorDashboardData = async (req, res) => {
  try {
    const educatorId = req.auth.userId;

    // Get all courses with enrolled students count
    const courses = await Course.find({ educator: educatorId }).select(
      "courseTitle enrolledStudents"
    );

    const totalCourses = courses.length;
    const totalStudents = courses.reduce(
      (sum, course) => sum + course.enrolledStudents.length,
      0
    );

    // Get all completed purchases
    const courseIds = courses.map((course) => course._id);
    const purchases = await Purchase.find({
      courseId: { $in: courseIds },
      status: "completed",
    });

    const totalEarnings = purchases.reduce(
      (sum, purchase) => sum + purchase.amount,
      0
    );

    // Get recent enrolled students (last 5)
    const recentStudents = await Purchase.find({
      courseId: { $in: courseIds },
      status: "completed",
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("userId", "name imageUrl")
      .populate("courseId", "courseTitle");

    res.json({
      success: true,
      dashboardData: {
        totalCourses,
        totalStudents,
        totalEarnings,
        recentEnrollments: recentStudents.map((purchase) => ({
          student: purchase.userId,
          courseTitle: purchase.courseId.courseTitle,
          enrolledDate: purchase.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get Enrolled Students
export const getEnrolledStudentsData = async (req, res) => {
  try {
    const educatorId = req.auth.userId;

    // Get all courses by this educator
    const courses = await Course.find({ educator: educatorId }).select(
      "_id courseTitle"
    );

    const courseIds = courses.map((course) => course._id);

    // Get all purchases with student and course details
    const purchases = await Purchase.find({
      courseId: { $in: courseIds },
      status: "completed",
    })
      .populate("userId", "name email imageUrl")
      .populate("courseId", "courseTitle")
      .sort({ createdAt: -1 });

    // Format the response
    const enrolledStudents = purchases.map((purchase) => ({
      student: {
        _id: purchase.userId._id,
        name: purchase.userId.name,
        email: purchase.userId.email,
        imageUrl: purchase.userId.imageUrl,
      },
      courseId: purchase.courseId._id,
      courseTitle: purchase.courseId.courseTitle,
      enrolledDate: purchase.createdAt,
      purchaseId: purchase._id,
    }));

    res.json({
      success: true,
      enrolledStudents,
      count: enrolledStudents.length,
    });
  } catch (error) {
    console.error("Error fetching enrolled students:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
