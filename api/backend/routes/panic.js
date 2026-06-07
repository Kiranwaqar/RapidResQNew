/**
 * Panic Button Route with Email Notifications
 * Handles emergency panic button functionality and sends emails to all volunteers
 */
const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const User = require('../models/User');
const CommunityPost = require('../models/CommunityPost');

// Configure email transporter (using Gmail as example)
// You can use other services like SendGrid, Mailgun, etc.
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Your email address
    pass: process.env.EMAIL_PASSWORD // Your email password or app password
  }
});

/**
 * Send email to all volunteers
 * @param {Object} postData - The emergency post data
 */
async function sendEmailToVolunteers(postData) {
  try {
    // Find all volunteers
    const volunteers = await User.find({ isVolunteer: true }).select('email fullName');
    
    if (volunteers.length === 0) {
      console.log('No volunteers found to notify');
      return;
    }

    console.log(`Found ${volunteers.length} volunteers to notify`);

    // Prepare email content
    const emailSubject = `🚨 EMERGENCY ALERT: ${postData.title}`;
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">🚨 EMERGENCY ALERT</h1>
        </div>
        
        <div style="padding: 20px; background-color: #f9fafb; border: 2px solid #dc2626;">
          <h2 style="color: #dc2626; margin-top: 0;">${postData.title}</h2>
          
          <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p style="margin: 10px 0;"><strong>Type:</strong> ${postData.type}</p>
            <p style="margin: 10px 0;"><strong>Person in Need:</strong> ${postData.author}</p>
            <p style="margin: 10px 0;"><strong>Location:</strong> ${postData.location}</p>
            <p style="margin: 10px 0;"><strong>Phone:</strong> ${postData.phone}</p>
            <p style="margin: 10px 0;"><strong>Description:</strong> ${postData.description}</p>
            <p style="margin: 10px 0;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          </div>
          
          <div style="background-color: #fef2f2; padding: 15px; border-left: 4px solid #dc2626; margin: 15px 0;">
            <p style="margin: 0; color: #991b1b;">
              <strong>⚠️ URGENT ACTION REQUIRED</strong><br>
              This is an emergency situation. Please respond immediately if you are available to help.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 20px;">
            <p style="color: #6b7280; font-size: 14px;">
              You are receiving this email because you are registered as a volunteer.
            </p>
          </div>
        </div>
      </div>
    `;

    // Send email to each volunteer
    const emailPromises = volunteers.map(volunteer => {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: volunteer.email,
        subject: emailSubject,
        html: emailBody
      };

      return transporter.sendMail(mailOptions)
        .then(() => {
          console.log(`✅ Email sent to: ${volunteer.email}`);
          return { success: true, email: volunteer.email };
        })
        .catch(error => {
          console.error(`❌ Failed to send email to ${volunteer.email}:`, error.message);
          return { success: false, email: volunteer.email, error: error.message };
        });
    });

    // Wait for all emails to be sent
    const results = await Promise.all(emailPromises);
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    console.log(`Email summary: ${successCount} sent, ${failureCount} failed`);
    
    return {
      totalVolunteers: volunteers.length,
      successCount,
      failureCount,
      results
    };
  } catch (error) {
    console.error('Error sending emails to volunteers:', error);
    throw error;
  }
}

/**
 * @route   POST /api/panic
 * @desc    Create emergency panic post from logged-in user and notify all volunteers
 * @access  Public (requires username in body)
 */
router.post('/panic', async (req, res) => {
  console.log('🚨 Panic button route hit!', req.body);
  try {
    const { username } = req.body;

    // Validate username
    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }

    // Find user by username
    const user = await User.findOne({ 
      username: username.trim().toLowerCase() 
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found. Please log in again.'
      });
    }

    // Get user data
    const fullName = user.fullName || user.username || 'Unknown User';
    const phone = user.phone || '';
    const location = user.location || '';

    // Validate required fields
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required for emergency alerts. Please update your profile with a phone number.',
        missingField: 'phone'
      });
    }

    if (!location) {
      return res.status(400).json({
        success: false,
        message: 'Location is required for emergency alerts. Please update your profile with your location.',
        missingField: 'location'
      });
    }

    // Validate phone format (remove non-digits and check length)
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Please provide a valid phone number.',
        missingField: 'phone'
      });
    }

    // Create emergency post — use allowed enum type and include createdBy
    const emergencyPost = new CommunityPost({
      type: 'Medical Emergency',
      title: 'EMERGENCY – LIFE IN DANGER',
      description: 'This is an emergency panic alert. The user is in immediate danger and unable to provide details. Please contact immediately and send help to the location.',
      location: location,
      phone: phoneDigits,
      author: fullName,
      createdBy: user.username || fullName,
      urgent: true,
      responses: 0
    });

    await emergencyPost.save();

    // Send emails to all volunteers (don't wait for completion)
    // This runs in the background so the user gets immediate response
    sendEmailToVolunteers({
      title: emergencyPost.title,
      type: emergencyPost.type,
      author: emergencyPost.author,
      location: emergencyPost.location,
      phone: phoneDigits,
      description: emergencyPost.description
    }).catch(error => {
      console.error('Background email sending failed:', error);
      // Don't fail the request if emails fail
    });

    res.status(201).json({
      success: true,
      message: 'Emergency alert posted successfully. Volunteers are being notified via email.',
      post: {
        id: emergencyPost._id,
        title: emergencyPost.title,
        type: emergencyPost.type,
        urgent: emergencyPost.urgent,
        location: emergencyPost.location
      }
    });
  } catch (error) {
    console.error('Panic button error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating emergency post',
      error: error.message
    });
  }
});

module.exports = router;