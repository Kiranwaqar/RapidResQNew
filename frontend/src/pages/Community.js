import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Phone,
  MapPin,
  AlertTriangle,
  Filter,
  User,
  Edit3,
  Trash2
} from "lucide-react";
import { handlePanicButton } from "../utils/panicButton";
import "./Community.css";
import  API_URL  from '../utils/config'; // adjust the path if needed
// Feature flag: set REACT_APP_WHATSAPP_ENABLED=true in your environment to enable
const WHATSAPP_ENABLED = (process.env.REACT_APP_WHATSAPP_ENABLED || process.env.WHATSAPP_ENABLED) === 'true';
function CommunityBoard() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("All");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMyPosts, setShowMyPosts] = useState(false);
  const [editingPostId, setEditingPostId] = useState(null);

  const [userId] = useState(() => {
    let id = localStorage.getItem("communityUserId");
    if (!id) {
      id = "user_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("communityUserId", id);
    }
    return id;
  });

  const [loggedInUser, setLoggedInUser] = useState("");

  const [formData, setFormData] = useState({
    type: "Blood Needed",
    title: "",
    description: "",
    location: "",
    phone: "",
    author: "",
    urgent: false
  });

  const [advancedFilters, setAdvancedFilters] = useState({
    timeRange: "",
    location: "",
    status: "",
    sortBy: "createdAt",
    order: "desc",
    searchQuery: ""
  });

  const filters = [
    { id: "All", label: "All" },
    { id: "Blood Needed", label: "Blood Needed" },
    { id: "Missing Person", label: "Missing Person" },
    { id: "Medical Emergency", label: "Medical Emergency" },
    { id: "Shelter Needed", label: "Shelter Needed" },
    { id: "Food / Water", label: "Food / Water" },
    { id: "Disaster Help", label: "Disaster Help" },
    { id: "Urgent", label: "Urgent Only" }
  ];

  const timeRanges = [
    { value: "", label: "All Time" },
    { value: "1h", label: "Last Hour" },
    { value: "24h", label: "Last 24 Hours" },
    { value: "7d", label: "Last 7 Days" },
    { value: "30d", label: "Last 30 Days" }
  ];

  const statusOptions = [
    { value: "", label: "All Status" },
    { value: "open", label: "Active" },
    { value: "in-progress", label: "Help Received" },
    { value: "resolved", label: "Resolved" },
    { value: "closed", label: "Closed" }
  ];

  const getTimeAgo = (timestamp) => {
    if (!timestamp) return "Unknown";
    const now = new Date();
    const postDate = new Date(timestamp);
    const diffInSeconds = Math.floor((now - postDate) / 1000);

    if (diffInSeconds < 60) return diffInSeconds + "s ago";
    if (diffInSeconds < 3600) return Math.floor(diffInSeconds / 60) + "m ago";
    if (diffInSeconds < 86400) return Math.floor(diffInSeconds / 3600) + "h ago";
    return Math.floor(diffInSeconds / 86400) + "d ago";
  };

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      let url = `${API_URL}/community/posts`;

      const params = new URLSearchParams();

      if (activeFilter !== "All") {
        if (activeFilter === "Urgent") {
          params.append("urgent", "true");
        } else {
          params.append("type", activeFilter);
        }
      }

      if (showMyPosts && loggedInUser) {
        params.append("myPosts", "true");
        params.append("username", loggedInUser);
      }

      if (advancedFilters.timeRange) {
        params.append("timeRange", advancedFilters.timeRange);
      }
      if (advancedFilters.location) {
        params.append("location", advancedFilters.location);
      }
      if (advancedFilters.status) {
        params.append("status", advancedFilters.status);
      }
      if (advancedFilters.searchQuery) {
        params.append("search", advancedFilters.searchQuery);
      }

      params.append("sortBy", advancedFilters.sortBy);
      params.append("order", advancedFilters.order);

      if (params.toString()) {
        url += "?" + params.toString();
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        const formattedPosts = data.posts.map((post) => ({
          ...post,
          timeAgo: getTimeAgo(post.createdAt),
          isMyPost: post.author === loggedInUser
        }));
        setPosts(formattedPosts);
      } else {
        console.error("Error fetching posts:", data.message);
        setPosts([]);
      }
    } catch (error) {
      console.error("Error fetching posts:", error);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [activeFilter, showMyPosts, advancedFilters, loggedInUser]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleFilterChange = (filterId) => {
    setActiveFilter(filterId);
  };

  const toggleMyPosts = () => {
    setShowMyPosts(!showMyPosts);
    setActiveFilter("All");
    // Show confirmation when switching modes
    if (!showMyPosts && formData.author) {
      setTimeout(() => {
        console.log("Showing posts by: " + formData.author);
      }, 100);
    }
  };

  const openWhatsApp = (phone, postTitle, postLocation) => {
    if (!phone) {
      alert("Phone number not available");
      return;
    }

    // Use server-side wa.me generator for safer normalization and to centralize logic.
    try {
      const base = API_URL.replace(/\/$/, "");
      const waUrl = `${base}/wa?phone=${encodeURIComponent(phone)}&title=${encodeURIComponent(postTitle||"")}&location=${encodeURIComponent(postLocation||"")}`;
      window.open(waUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error('Failed to open WhatsApp via server endpoint, falling back to client', e);
      const fallback = 'https://wa.me/' + encodeURIComponent(phone) + '?text=' + encodeURIComponent('Hello, I saw your emergency post. How can I help?');
      window.open(fallback, "_blank", "noopener,noreferrer");
    }
  };

  const handleStatusUpdate = async (postId, newStatus) => {
    try {
      const response = await fetch(
        `${API_URL}/community/posts/${postId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            status: newStatus,
            username: loggedInUser
          })
        }
      );

      const data = await response.json();

      if (data.success) {
        alert("Post status updated successfully!");
        setEditingPostId(null);
        fetchPosts();
      } else {
        alert("Error: " + (data.message || "Failed to update status"));
      }
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Error updating status: " + error.message);
    }
  };

  const handleDeletePost = async (postId) => {
    if (!window.confirm("Are you sure you want to delete this post?")) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/community/posts/${postId}?username=${loggedInUser}`,
        {
          method: "DELETE"
        }
      );

      const data = await response.json();

      if (data.success) {
        alert("Post deleted successfully!");
        fetchPosts();
      } else {
        alert("Error: " + (data.message || "Failed to delete post"));
      }
    } catch (error) {
      console.error("Error deleting post:", error);
      alert("Error deleting post: " + error.message);
    }
  };

  const handleSubmitPost = async (e) => {
    e.preventDefault();

    if (
      !formData.type ||
      !formData.title ||
      !formData.description ||
      !formData.location ||
      !formData.phone ||
      !formData.author
    ) {
      alert("Please fill in all required fields");
      return;
    }

    if (formData.title.length < 5) {
      alert("Title must be at least 5 characters");
      return;
    }

    if (formData.description.length < 10) {
      alert("Description must be at least 10 characters");
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/community/posts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            type: formData.type,
            title: formData.title,
            description: formData.description,
            location: formData.location,
            phone: formData.phone,
            author: formData.author,
            urgent: formData.urgent,
            createdBy: userId
          })
        }
      );

      const data = await response.json();

      if (data.success) {
        setLoggedInUser(formData.author);
        alert("Post created successfully!");
        setFormData({
          type: "Blood Needed",
          title: "",
          description: "",
          location: "",
          phone: "",
          author: "",
          urgent: false
        });
        setShowCreateModal(false);
        fetchPosts();
      } else {
        const errorMsg = data.message || "Failed to create post";
        console.error("Backend error:", errorMsg);
        alert("Error: " + errorMsg);
      }
    } catch (error) {
      console.error("Error creating post:", error);
      alert("Error creating post: " + error.message);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "open":
        return "#10b981";
      case "in-progress":
        return "#3b82f6";
      case "resolved":
        return "#8b5cf6";
      case "closed":
        return "#6b7280";
      default:
        return "#10b981";
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "open":
        return "Active";
      case "in-progress":
        return "Help Received";
      case "resolved":
        return "Resolved";
      case "closed":
        return "Closed";
      default:
        return status || "Unknown";
    }
  };

  return React.createElement(
    "div",
    { className: "community-container" },
    React.createElement(
      "main",
      { className: "main-content" },
      React.createElement(
        "div",
        { className: "page-header" },
        React.createElement(
          "div",
          null,
          React.createElement("h1", null, "Community Help Board"),
          React.createElement(
            "p",
            { className: "subtitle" },
            "Connect with people in emergencies"
          ),
          loggedInUser && React.createElement(
            "p",
            { style: { fontSize: "14px", color: "#666", marginTop: "5px" } },
            "Logged in as: " + loggedInUser
          )
        ),
        React.createElement(
          "div",
          { style: { display: "flex", gap: "10px" } },
          React.createElement(
            "button",
            {
              className: "filter-toggle-btn " + (showMyPosts ? "active" : ""),
              onClick: toggleMyPosts,
              title: "View my posts"
            },
            React.createElement(User, { size: 18 }),
            " ",
            showMyPosts ? "All Posts" : "My Posts"
          ),
          React.createElement(
            "button",
            {
              className: "filter-toggle-btn",
              onClick: () => setShowAdvancedFilters(!showAdvancedFilters),
              title: "Advanced filters"
            },
            React.createElement(Filter, { size: 18 }),
            " Filters"
          ),
          React.createElement(
            "button",
            {
              className: "create-post-btn",
              onClick: () => setShowCreateModal(true)
            },
            React.createElement(Plus, { size: 18 }),
            " Create Post"
          )
        )
      ),
      showAdvancedFilters &&
        React.createElement(
          "div",
          { className: "advanced-filters" },
          React.createElement(
            "div",
            { className: "filter-group" },
            React.createElement("label", null, "Search Posts"),
            React.createElement("input", {
              type: "text",
              placeholder: "Search by title, description, or author...",
              value: advancedFilters.searchQuery,
              onChange: (e) =>
                setAdvancedFilters({
                  ...advancedFilters,
                  searchQuery: e.target.value
                })
            })
          ),
          React.createElement(
            "div",
            { className: "filter-group" },
            React.createElement("label", null, "Time Range"),
            React.createElement(
              "select",
              {
                value: advancedFilters.timeRange,
                onChange: (e) =>
                  setAdvancedFilters({
                    ...advancedFilters,
                    timeRange: e.target.value
                  })
              },
              timeRanges.map((opt) =>
                React.createElement(
                  "option",
                  { key: opt.value, value: opt.value },
                  opt.label
                )
              )
            )
          ),
          React.createElement(
            "div",
            { className: "filter-group" },
            React.createElement("label", null, "Location"),
            React.createElement("input", {
              type: "text",
              placeholder: "Search location...",
              value: advancedFilters.location,
              onChange: (e) =>
                setAdvancedFilters({
                  ...advancedFilters,
                  location: e.target.value
                })
            })
          ),
          React.createElement(
            "div",
            { className: "filter-group" },
            React.createElement("label", null, "Status"),
            React.createElement(
              "select",
              {
                value: advancedFilters.status,
                onChange: (e) =>
                  setAdvancedFilters({
                    ...advancedFilters,
                    status: e.target.value
                  })
              },
              statusOptions.map((opt) =>
                React.createElement(
                  "option",
                  { key: opt.value, value: opt.value },
                  opt.label
                )
              )
            )
          ),
          React.createElement(
            "div",
            { className: "filter-group" },
            React.createElement("label", null, "Sort By"),
            React.createElement(
              "select",
              {
                value: advancedFilters.sortBy,
                onChange: (e) =>
                  setAdvancedFilters({
                    ...advancedFilters,
                    sortBy: e.target.value
                  })
              },
              React.createElement("option", { value: "createdAt" }, "Date Created"),
              React.createElement("option", { value: "updatedAt" }, "Last Updated")
            )
          ),
          React.createElement(
            "div",
            { className: "filter-group" },
            React.createElement("label", null, "Order"),
            React.createElement(
              "select",
              {
                value: advancedFilters.order,
                onChange: (e) =>
                  setAdvancedFilters({
                    ...advancedFilters,
                    order: e.target.value
                  })
              },
              React.createElement("option", { value: "desc" }, "Newest First"),
              React.createElement("option", { value: "asc" }, "Oldest First")
            )
          ),
          React.createElement(
            "button",
            {
              className: "clear-filters-btn",
              onClick: () =>
                setAdvancedFilters({
                  timeRange: "",
                  location: "",
                  status: "",
                  sortBy: "createdAt",
                  order: "desc",
                  searchQuery: ""
                })
            },
            "Clear Filters"
          )
        ),
      React.createElement(
        "div",
        { className: "filters" },
        filters.map((f) =>
          React.createElement(
            "button",
            {
              key: f.id,
              className:
                "filter-btn " + (activeFilter === f.id ? "active" : ""),
              onClick: () => handleFilterChange(f.id)
            },
            f.label
          )
        )
      ),
      React.createElement(
        "div",
        { className: "posts-list" },
        loading
          ? React.createElement(
              "div",
              { style: { textAlign: "center", padding: "2rem" } },
              React.createElement("p", null, "Loading posts...")
            )
          : posts.length === 0
          ? React.createElement(
              "div",
              { style: { textAlign: "center", padding: "2rem" } },
              React.createElement(
                "p",
                null,
                showMyPosts
                  ? "No emergency posts created by " + loggedInUser + ". Click 'Create Post' to help someone!"
                  : "No emergency posts found. Be the first to create a help request!"
              )
            )
          : posts.map((post) =>
              React.createElement(
                "div",
                { key: post._id, className: "post-card" },
                React.createElement(
                  "div",
                  { className: "post-header" },
                  React.createElement(
                    "div",
                    {
                      style: {
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                        flexWrap: "wrap"
                      }
                    },
                    React.createElement(
                      "span",
                      { className: "tag" },
                      post.type
                    ),
                    post.urgent &&
                      React.createElement(
                        "span",
                        { className: "tag urgent" },
                        "Urgent"
                      ),
                    post.isMyPost &&
                      React.createElement(
                        "span",
                        { className: "tag my-post" },
                        "My Post"
                      ),
                    editingPostId === post._id && post.isMyPost
                      ? React.createElement(
                          "select",
                          {
                            className: "status-select",
                            value: post.status,
                            onChange: (e) =>
                              handleStatusUpdate(post._id, e.target.value),
                            onClick: (e) => e.stopPropagation()
                          },
                          React.createElement("option", { value: "open" }, "Active"),
                          React.createElement(
                            "option",
                            { value: "in-progress" },
                            "Help Received"
                          ),
                          React.createElement(
                            "option",
                            { value: "resolved" },
                            "Resolved"
                          ),
                          React.createElement("option", { value: "closed" }, "Closed")
                        )
                      : React.createElement(
                          "span",
                          {
                            className: "tag status-tag",
                            style: { backgroundColor: getStatusColor(post.status) }
                          },
                          getStatusLabel(post.status)
                        )
                  ),
                  React.createElement("span", { className: "time" }, post.timeAgo)
                ),
                React.createElement("h3", null, post.title),
                React.createElement("p", null, post.description),
                React.createElement(
                  "div",
                  { className: "post-info" },
                  React.createElement(
                    "span",
                    null,
                    React.createElement(MapPin, { size: 14 }),
                    " ",
                    post.location
                  ),
                  post.phone &&
                    React.createElement(
                      "span",
                      null,
                      React.createElement(Phone, { size: 14 }),
                      " ",
                      post.phone
                    )
                ),
                React.createElement(
                  "div",
                  { className: "post-footer" },
                  React.createElement("span", null, post.author),
                  React.createElement(
                    "div",
                    { style: { display: "flex", gap: "8px" } },
                    post.isMyPost &&
                      React.createElement(
                        React.Fragment,
                        null,
                        React.createElement(
                          "button",
                          {
                            className: "icon-btn edit-btn",
                            onClick: () =>
                              setEditingPostId(
                                editingPostId === post._id ? null : post._id
                              ),
                            title: "Edit status"
                          },
                          React.createElement(Edit3, { size: 16 })
                        ),
                        React.createElement(
                          "button",
                          {
                            className: "icon-btn delete-btn",
                            onClick: () => handleDeletePost(post._id),
                            title: "Delete post"
                          },
                          React.createElement(Trash2, { size: 16 })
                        )
                      ),
                    WHATSAPP_ENABLED
                      ? React.createElement(
                          "button",
                          {
                            className: "respond-btn",
                            onClick: () =>
                              openWhatsApp(post.phone, post.title, post.location)
                          },
                          "Respond on WhatsApp"
                        )
                      : React.createElement(
                          "button",
                          {
                            className: "respond-btn disabled",
                            disabled: true,
                            title: "WhatsApp disabled in this environment"
                          },
                          "Respond on WhatsApp"
                        )
                  )
                )
              )
            )
      )
    ),
    React.createElement(
      "button",
      { className: "fab", onClick: () => handlePanicButton(navigate) },
      React.createElement(AlertTriangle)
    ),
    showCreateModal &&
      React.createElement(
        "div",
        {
          className: "modal-overlay",
          onClick: () => setShowCreateModal(false)
        },
        React.createElement(
          "div",
          {
            className: "create-modal",
            onClick: (e) => e.stopPropagation()
          },
          React.createElement(
            "div",
            { className: "modal-header" },
            React.createElement("h2", null, "Create Help Request"),
            React.createElement(
              "button",
              {
                className: "close-btn",
                onClick: () => setShowCreateModal(false)
              },
              "X"
            )
          ),
          React.createElement(
            "form",
            { className: "create-form" },
            React.createElement(
              "div",
              { className: "form-group" },
              React.createElement("label", null, "Category *"),
              React.createElement(
                "select",
                {
                  value: formData.type,
                  onChange: (e) =>
                    setFormData({ ...formData, type: e.target.value })
                },
                React.createElement("option", { value: "Blood Needed" }, "Blood Needed"),
                React.createElement("option", { value: "Missing Person" }, "Missing Person"),
                React.createElement("option", { value: "Medical Emergency" }, "Medical Emergency"),
                React.createElement("option", { value: "Shelter Needed" }, "Shelter Needed"),
                React.createElement("option", { value: "Food / Water" }, "Food / Water"),
                React.createElement("option", { value: "Disaster Help" }, "Disaster Help")
              )
            ),
            React.createElement(
              "div",
              { className: "form-group" },
              React.createElement("label", null, "Title * (min 5 characters)"),
              React.createElement("input", {
                type: "text",
                placeholder: "Brief title",
                value: formData.title,
                onChange: (e) =>
                  setFormData({ ...formData, title: e.target.value }),
                maxLength: "100"
              }),
              React.createElement(
                "span",
                { style: { fontSize: "12px", color: "#999" } },
                formData.title.length + "/100"
              )
            ),
            React.createElement(
              "div",
              { className: "form-group" },
              React.createElement("label", null, "Description * (min 10 characters)"),
              React.createElement("textarea", {
                placeholder: "Describe your situation...",
                value: formData.description,
                onChange: (e) =>
                  setFormData({ ...formData, description: e.target.value }),
                maxLength: "1000",
                rows: "4"
              }),
              React.createElement(
                "span",
                { style: { fontSize: "12px", color: "#999" } },
                formData.description.length + "/1000"
              )
            ),
            React.createElement(
              "div",
              { className: "form-group" },
              React.createElement("label", null, "Location * (City, Area, Hospital Name)"),
              React.createElement("input", {
                type: "text",
                placeholder: "e.g., Karachi, Federal B Area",
                value: formData.location,
                onChange: (e) =>
                  setFormData({ ...formData, location: e.target.value }),
                maxLength: "100"
              })
            ),
            React.createElement(
              "div",
              { className: "form-group" },
              React.createElement("label", null, "Contact Phone * (10-15 digits)"),
              React.createElement("input", {
                type: "tel",
                placeholder: "e.g., 03001234567 or 923001234567",
                value: formData.phone,
                onChange: (e) =>
                  setFormData({
                    ...formData,
                    phone: e.target.value.replace(/\D/g, "")
                  }),
                maxLength: "15"
              }),
              React.createElement(
                "span",
                { style: { fontSize: "12px", color: "#999" } },
                formData.phone.length + " digits"
              )
            ),
            React.createElement(
              "div",
              { className: "form-group" },
              React.createElement("label", null, "Your Name *"),
              React.createElement("input", {
                type: "text",
                placeholder: "Your name",
                value: formData.author,
                onChange: (e) =>
                  setFormData({ ...formData, author: e.target.value }),
                maxLength: "100"
              })
            ),
            React.createElement(
              "div",
              { className: "form-group" },
              React.createElement(
                "label",
                { className: "checkbox-label" },
                React.createElement("input", {
                  type: "checkbox",
                  checked: formData.urgent,
                  onChange: (e) =>
                    setFormData({ ...formData, urgent: e.target.checked })
                }),
                React.createElement("span", null, "Mark as Urgent")
              )
            ),
            React.createElement(
              "button",
              {
                className: "submit-btn",
                type: "button",
                onClick: handleSubmitPost
              },
              "Post Request"
            )
          )
        )
      )
  );
}

export default CommunityBoard;