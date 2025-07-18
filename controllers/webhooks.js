import Stripe from 'stripe';
import User from '../models/User.js';
import { Webhook } from 'svix';
import { Purchase } from '../models/Purchase.js';
import Course from '../models/Course.js';

export const clerkWebhooks = async (req, res) => {
    try {
        const whook = new Webhook(process.env.CLERK_WEBHOOK_SECRET);
        await whook.verify(JSON.stringify(req.body), {
            "svix-id": req.headers["svix-id"],
            "svix-timestamp": req.headers["svix-timestamp"],
            "svix-signature": req.headers["svix-signature"],
        });

        const {data, type} = req.body;
  
        switch(type) {
            case 'user.created': {
                const userData = {
                    _id: data.id,
                    email: data.email_addresses[0].email_address,
                    name: `${data.first_name} ${data.last_name}`,
                    imageUrl: data.image_url,
                };
                await User.create(userData);
                return res.json({});
            }

            case 'user.updated': {
                const userData = {
                    email: data.email_addresses[0].email_address,
                    name: `${data.first_name} ${data.last_name}`,
                    imageUrl: data.image_url,
                };
                await User.findByIdAndUpdate(data.id, userData);
                return res.json({});
            }

            default:
                return res.status(200).json({});
        }

    } catch (error) {
        return res.status(500).json({success: false, message: error.message});
    }
};

const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);

export const stripeWebhooks = async (request, response) => {
    const sig = request.headers['stripe-signature'];
    let event;

    try {
        event = stripeInstance.webhooks.constructEvent(
            request.body, 
            sig, 
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (error) {
        return response.status(400).send(`Webhook Error: ${error.message}`);
    }

    try {
        switch(event.type) {
            case 'payment_intent.succeeded': {
                const paymentIntent = event.data.object;
                const paymentIntentId = paymentIntent.id;

                const session = await stripeInstance.checkout.sessions.list({
                    payment_intent: paymentIntentId
                });

                const {purchaseId} = session.data[0].metadata;
                
                const purchaseData = await Purchase.findById(purchaseId);
                const userData = await User.findById(purchaseData.userId);
                const courseData = await Course.findById(purchaseData.courseId.toString());

                courseData.enrolledStudents.push(userData);
                await courseData.save();

                userData.enrolledCourses.push(courseData._id);
                await userData.save();

                purchaseData.status = 'completed';
                await purchaseData.save();

                break;
            }

            case 'payment_intent.payment_failed': {  
                const paymentIntent = event.data.object;
                const paymentIntentId = paymentIntent.id;

                const session = await stripeInstance.checkout.sessions.list({
                    payment_intent: paymentIntentId
                });

                const {purchaseId} = session.data[0].metadata;
                const purchaseData = await Purchase.findById(purchaseId);
                
                purchaseData.status = 'failed';
                await purchaseData.save();
                break;
            }

            default:
                console.log(`Unhandled event type ${event.type}`);
        }

        return response.json({received: true});

    } catch (error) {
        console.error('Webhook processing error:', error);
        return response.status(500).json({error: 'Internal server error'});
    }
};