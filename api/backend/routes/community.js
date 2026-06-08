const express = require('express');
const router = express.Router();
const CommunityPost = require('../models/CommunityPost');
const { getDemoModel } = require('../config/dbConnections');

// Utility function to validate phone number
const validatePhoneNumber = (phone) => {
  // Remove all non-digit characters
  const cleanPhone = phone.replace(/\D/g, '');
  
  // Accept phone numbers with 10-15 digits after cleaning
  return cleanPhone.length >= 10 && cleanPhone.length <= 15;
};

// GET all posts with filtering
router.get('/posts', async (req, res) => {
  try {
    const {
      type,
      urgent,
      status,
      location,
      timeRange,
      sortBy = 'createdAt',
      order = 'desc',
      myPosts,
      username,
      search
    } = req.query;

    const filter = {};

    // My Posts filter - IMPORTANT: Match author field with username
    if (myPosts === 'true' && username) {
      filter.author = username;
    }

    // Type filter
    if (type && type !== 'All') {
      filter.type = type;
    }

    // Urgent filter
    if (urgent === 'true') {
      filter.urgent = true;
    }

    // Status filter
    if (status && status !== '') {
      filter.status = status;
    } else if (myPosts !== 'true') {
      // Default: show open and in-progress posts only when viewing all posts
      filter.status = { $in: ['open', 'in-progress'] };
    }

    // Location filter (case-insensitive)
    if (location && location !== '') {
      filter.location = { $regex: location, $options: 'i' };
    }

    // Search filter (searches title, description, and author)
    if (search && search !== '') {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { author: { $regex: search, $options: 'i' } }
      ];
    }

    // Time range filter
    if (timeRange && timeRange !== '') {
      const now = new Date();
      let fromDate;

      switch (timeRange) {
        case '1h':
          fromDate = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          fromDate = null;
      }

      if (fromDate) {
        filter.createdAt = { $gte: fromDate };
      }
    }

    // Sort options
    let sortOptions = {};
    if (sortBy === 'createdAt') {
      sortOptions = { createdAt: order === 'desc' ? -1 : 1 };
    } else if (sortBy === 'updatedAt') {
      sortOptions = { updatedAt: order === 'desc' ? -1 : 1 };
    } else if (sortBy === 'urgent') {
      sortOptions = { urgent: -1, createdAt: -1 };
    } else {
      sortOptions = { createdAt: -1 };
    }

    // Try to read from demo DB (if configured) so preview/production can be
    // separated. Fall back to the default model if demo is unavailable.
    const demoCommunity = await getDemoModel('CommunityPost', CommunityPost).catch(() => null);
    const CommunityModelToUse = demoCommunity || CommunityPost;

    const posts = await CommunityModelToUse.find(filter)
      .sort(sortOptions)
      .limit(200);

    res.json({
      success: true,
      posts: posts,
      count: posts.length,
      filters: {
        myPosts: myPosts === 'true' ? true : false,
        username: username || null,
        search: search || null
      }
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching posts',
      error: error.message
    });
  }
});

// POST create new post
router.post('/posts', async (req, res) => {
  try {
    const {
      type,
      title,
      description,
      location,
      phone,
      author,
      urgent,
      createdBy
    } = req.body;

    // Validation
    if (!type || !title || !description || !location || !phone || !author) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Validate phone number
    if (!validatePhoneNumber(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number. Please enter a valid phone number with 10-15 digits'
      });
    }

    // Clean phone number (remove non-digits)
    const cleanPhone = phone.replace(/\D/g, '');

    // Validate title length
    if (title.length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Title must be at least 5 characters'
      });
    }

    // Validate description length
    if (description.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Description must be at least 10 characters'
      });
    }

    // Create new post
    // Create using demo DB model when available
    const demoCommunityCreate = await getDemoModel('CommunityPost', CommunityPost).catch(() => null);
    const CommunityCreateModel = demoCommunityCreate || CommunityPost;

    const newPost = new CommunityCreateModel({
      type,
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      phone: cleanPhone,
      author: author.trim(),
      urgent: urgent === true || urgent === 'true' || false,
      createdBy: (createdBy || author).trim(),
      status: 'open',
      responses: 0
    });

    await newPost.save();

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      post: newPost
    });
  } catch (error) {
    console.error('Error creating post:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating post',
      error: error.message
    });
  }
});

// PATCH update post status
router.patch('/posts/:postId/status', async (req, res) => {
  try {
    const { postId } = req.params;
    const { status, closureNote, username } = req.body;

    if (!status || !username) {
      return res.status(400).json({
        success: false,
        message: 'Status and username are required'
      });
    }

    // Validate status
    const validStatuses = ['open', 'in-progress', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    // Find the post using demo model when available
    const demoCommunityForUpdate = await getDemoModel('CommunityPost', CommunityPost).catch(() => null);
    const CommunityModelForUpdate = demoCommunityForUpdate || CommunityPost;
    const post = await CommunityModelForUpdate.findById(postId);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Verify ownership - check if author matches the username
    if (post.author !== username) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own posts'
      });
    }

    // Update status
    post.status = status;

    if (closureNote !== undefined) {
      post.closureNote = closureNote.trim();
    }

    post.updatedAt = new Date();
    await post.save();

    res.json({
      success: true,
      message: 'Post status updated successfully',
      post: post
    });
  } catch (error) {
    console.error('Error updating post status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating post status',
      error: error.message
    });
  }
});

// DELETE post
router.delete('/posts/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const { username } = req.query;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }

    // Find the post using demo model when available
    const demoCommunityForDelete = await getDemoModel('CommunityPost', CommunityPost).catch(() => null);
    const CommunityModelForDelete = demoCommunityForDelete || CommunityPost;
    const post = await CommunityModelForDelete.findById(postId);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Verify ownership - check if author matches the username
    if (post.author !== username) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own posts'
      });
    }

    await CommunityModelForDelete.findByIdAndDelete(postId);

    res.json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting post',
      error: error.message
    });
  }
});

// GET single post by ID
router.get('/posts/:postId', async (req, res) => {
  try {
    const { postId } = req.params;

    const demoCommunityForRespond = await getDemoModel('CommunityPost', CommunityPost).catch(() => null);
    const CommunityModelForRespond = demoCommunityForRespond || CommunityPost;
    const post = await CommunityModelForRespond.findById(postId);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    res.json({
      success: true,
      post: post
    });
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching post',
      error: error.message
    });
  }
});

// PATCH increment response count
router.patch('/posts/:postId/respond', async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await CommunityPost.findById(postId);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    post.responses = (post.responses || 0) + 1;
    await post.save();

    res.json({
      success: true,
      message: 'Response count updated',
      responses: post.responses
    });
  } catch (error) {
    console.error('Error updating response count:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating response count',
      error: error.message
    });
  }
});

module.exports = router;