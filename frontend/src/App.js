import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import './App.css';

// --- MANUAL CONFIGURATION ---
const SUPABASE_URL = "https://uuuqqzqcjsmvoardttnh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1dXFxenFjanNtdm9hcmR0dG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0Mzg1NDgsImV4cCI6MjA5MTAxNDU0OH0.REOZUzFglYChEL5HG9dRIzHpGkSZ-VwAfkcR1V_v5HA";
const API_URL = "https://locaroo.onrender.com";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function App() {
  const [businesses, setBusinesses] = useState([]);
  const [user, setUser] = useState(null);
  const [category, setCategory] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [openDrawers, setOpenDrawers] = useState({});
  const [activeReviews, setActiveReviews] = useState({});
  const [reviewDataMap, setReviewDataMap] = useState({});
  const [favorites, setFavorites] = useState(new Set());

  // NEW: sidebar collapsed state & current view ("browse" | "favorites")
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [view, setView] = useState("browse");

  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      // Load favorites from backend when session exists
      if (session?.user) loadFavoritesFromBackend(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setShowAuth(false);
        loadFavoritesFromBackend(session.user.id);
      } else {
        // Clear favorites on sign out
        setFavorites(new Set());
      }
    });

    fetchData();
    return () => subscription.unsubscribe();
  }, [category]);

  // Load the user's saved favorites from Supabase directly
  const loadFavoritesFromBackend = async (userId) => {
    try {
      const res = await supabase
      .from("favorites")
      .select("business_id")
      .eq("user_id", userId);
      if (res.data) {
        setFavorites(new Set(res.data.map(f => f.business_id)));
      }
    } catch (err) {
      console.error("Could not load favorites", err);
    }
  };

  const fetchData = async (sortByRating = false) => {
    try {
      const queryVal = Array.isArray(category) ? "" : category;
      const response = await axios.get(`${API_URL}/businesses`, {
        params: { category: queryVal, sort_by_rating: sortByRating }
      });
      setBusinesses(response.data);
    } catch (err) {
      console.error("Backend Connection Error");
    }
  };

  const toggleDrawer = async (bizId) => {
    const isOpening = !openDrawers[bizId];
    setOpenDrawers(prev => ({ ...prev, [bizId]: !prev[bizId] }));
    if (isOpening && !activeReviews[bizId]) {
      try {
        const res = await axios.get(`${API_URL}/reviews/${bizId}`);
        setActiveReviews(prev => ({ ...prev, [bizId]: res.data }));
      } catch (err) {
        console.error("Error loading reviews");
      }
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      if (authMode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert("Check your email to verify your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const getReviewData = (bizId) => reviewDataMap[bizId] || { rating: "", comment: "", botCheck: "" };
  const setReviewField = (bizId, field, value) => {
    setReviewDataMap(prev => ({
      ...prev,
      [bizId]: { ...getReviewData(bizId), [field]: value }
    }));
  };

  const submitReview = async (bizId) => {
    if (!user) { setAuthMode("login"); setShowAuth(true); return; }
    const data = getReviewData(bizId);
    if (!data.rating) { alert("Please select a star rating."); return; }
    if (!data.comment.trim()) { alert("Please write a comment before submitting."); return; }
    if (!data.botCheck) { alert("Please answer the verification question."); return; }
    try {
      const res = await axios.post(`${API_URL}/reviews`, null, {
        params: {
          business_id: bizId,
          rating: parseInt(data.rating),
          comment: data.comment,
          bot_check: parseInt(data.botCheck),
          user_email: user.email
        }
      });
      alert(res.data.status);
      setReviewDataMap(prev => ({ ...prev, [bizId]: { rating: "", comment: "", botCheck: "" } }));
      const refreshed = await axios.get(`${API_URL}/reviews/${bizId}`);
      setActiveReviews(prev => ({ ...prev, [bizId]: refreshed.data }));
    } catch (err) {
      alert(err.response?.data?.detail || "Check your verification answer!");
    }
  };

  const toggleFavorite = async (bizId) => {
    if (!user) { setAuthMode("login"); setShowAuth(true); return; }
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) { alert("Could not get user ID. Please sign out and sign back in."); return; }

    // Optimistic update
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(bizId)) next.delete(bizId);
      else next.add(bizId);
      return next;
    });

    try {
      await axios.post(`${API_URL}/favorites`, null, {
        params: { business_id: bizId, user_id: userId }
      });
    } catch (err) {
      // Revert on failure
      setFavorites(prev => {
        const next = new Set(prev);
        if (next.has(bizId)) next.delete(bizId);
        else next.add(bizId);
        return next;
      });
      alert("Could not save favorite. Please try again.");
    }
  };

  const filteredBusinesses = businesses.filter(b => {
    const matchesSearch = b.name.toLowerCase().includes(searchTerm.toLowerCase());
    let matchesCategory = true;
    if (category !== "") {
      if (Array.isArray(category)) {
        matchesCategory = category.includes(b.category);
      } else {
        matchesCategory = b.category === category;
      }
    }
    return matchesSearch && matchesCategory;
  });

  // Businesses the user has favorited
  const favoritedBusinesses = businesses.filter(b => favorites.has(b.id));

  const navItems = [
    { label: "All businesses", value: "",                  dot: "dot-all" },
    { label: "Food & drink",   value: ["Food", "Drink"],   dot: "dot-food" },
    { label: "Retail",         value: "Retail",            dot: "dot-retail" },
    { label: "Services",       value: "Services",          dot: "dot-services" },
  ];

  // Shared card renderer used in both browse and favorites views
  const renderCard = (biz) => {
    const isFaved = favorites.has(biz.id);
    const cardReview = getReviewData(biz.id);
    const reviews = activeReviews[biz.id] || [];

    return (
      <div key={biz.id} className={`biz-card ${biz.deal ? "has-deal" : ""}`}>
        <div className={`card-band band-${biz.category?.toLowerCase() || "default"}`}>
          <span className="cat-pill">{biz.category}</span>
          {biz.deal && <span className="deal-pill">{biz.deal}</span>}
        </div>

        <div className="card-body">
          <div className="card-row-top">
            <h3 className="biz-name">{biz.name}</h3>
            <div className="rating-chip">
              <span className="star">★</span>
              <span className="rating-val">{biz.rating}</span>
            </div>
          </div>

          {biz.description && (
            <p className="biz-description">{biz.description}</p>
          )}

          <div className="card-actions">
            <button
              className={`btn-fav ${isFaved ? "faved" : ""}`}
              aria-label="Save"
              onClick={() => toggleFavorite(biz.id)}
              title={isFaved ? "Remove from favorites" : "Save to favorites"}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5"
                fill={isFaved ? "currentColor" : "none"}>
                <path d="M8 13.5S1.5 9.5 1.5 5.5a3.5 3.5 0 017 0 3.5 3.5 0 017 0c0 4-6.5 8-6.5 8z"/>
              </svg>
            </button>
            <button
              className={`btn-reviews ${openDrawers[biz.id] ? "open" : ""}`}
              onClick={() => toggleDrawer(biz.id)}
            >
              {openDrawers[biz.id] ? "Close" : (
                reviews.length > 0 ? `${reviews.length} reviews` : "Reviews"
              )}
            </button>
          </div>
        </div>

        <div className={`review-drawer ${openDrawers[biz.id] ? "open" : ""}`}>
          <div className="drawer-inner">
            {reviews.length > 0 && (
              <div className="reviews-list">
                {reviews.map((rev, i) => (
                  <div key={i} className="review-item">
                    <div className="rev-row">
                      <span className="rev-user">{rev.user_email.split('@')[0]}</span>
                      <span className="rev-stars">
                        {"★".repeat(Math.max(0, Math.min(5, rev.rating)))}
                        {"☆".repeat(Math.max(0, 5 - Math.min(5, rev.rating)))}
                      </span>
                    </div>
                    <p className="rev-comment">{rev.comment}</p>
                  </div>
                ))}
              </div>
            )}

            {reviews.length === 0 && openDrawers[biz.id] && (
              <p className="no-reviews">No reviews yet — be the first!</p>
            )}

            <div className="write-review">
              <p className="write-label">Write a review</p>
              <div className="star-picker">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    className={`star-btn ${parseInt(cardReview.rating) >= star ? "selected" : ""}`}
                    onClick={() => setReviewField(biz.id, "rating", star)}
                    type="button"
                  >★</button>
                ))}
                <span className="star-label">
                  {cardReview.rating ? `${cardReview.rating} / 5` : "Tap to rate"}
                </span>
              </div>

              <div className="form-field">
                <label className="f-label">Comment</label>
                <textarea className="f-input f-textarea" rows="2"
                  placeholder="Share your experience..."
                  value={cardReview.comment}
                  onChange={e => setReviewField(biz.id, "comment", e.target.value)} />
              </div>

              <div className="form-field">
                <label className="f-label">Verification: 5 + 7 = ?</label>
                <input className="f-input verify-input" type="text" placeholder="Answer"
                  value={cardReview.botCheck}
                  onChange={e => setReviewField(biz.id, "botCheck", e.target.value)} />
              </div>

              <button className="btn-submit" onClick={() => submitReview(biz.id)}>
                Submit review
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="locaroo-app">

      {/* AUTH MODAL */}
      {showAuth && (
        <div className="modal-overlay" onClick={() => setShowAuth(false)}>
          <div className="auth-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAuth(false)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 1l12 12M13 1L1 13"/>
              </svg>
            </button>
            <div className="auth-header">
              <div className="auth-logo-mark">
                <img src="/Locaroo_kangaroo_mas.png" alt="Locaroo" className="auth-logo-img" />
              </div>
              <h2 className="auth-title">
                {authMode === "signup" ? "Create account" : "Welcome back"}
              </h2>
              <p className="auth-subtitle">
                {authMode === "signup"
                  ? "Join the community and start reviewing"
                  : "Sign in to leave reviews"}
              </p>
            </div>
            <form className="auth-form" onSubmit={handleAuth}>
              <div className="field-group">
                <label className="field-label">Email</label>
                <input className="field-input" type="email" placeholder="you@example.com"
                  onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="field-group">
                <label className="field-label">Password</label>
                <input className="field-input" type="password" placeholder="••••••••"
                  onChange={e => setPassword(e.target.value)} required />
              </div>
              <button className="btn-auth-submit" type="submit">
                {authMode === "signup" ? "Create account" : "Sign in"}
              </button>
            </form>
            <p className="auth-switch" onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}>
              {authMode === "login"
                ? "Don't have an account? Sign up"
                : "Already have an account? Sign in"}
            </p>
          </div>
        </div>
      )}

      {/* SIDEBAR — NEW: collapses to icon rail when closed */}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>

        {/* Toggle button */}
        <button className="sidebar-toggle" onClick={() => setSidebarOpen(o => !o)} title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            {sidebarOpen
              ? <path d="M10 3L5 8l5 5"/>   /* chevron left */
              : <path d="M6 3l5 5-5 5"/>    /* chevron right */
            }
          </svg>
        </button>

        {/* Logo — hide text when collapsed */}
        <div className="sidebar-logo">
          <img src="/Locaroo_kangaroo_mas.png" alt="Locaroo" className="sidebar-logo-img" />
        </div>

        <nav className="sidebar-nav">
          {sidebarOpen && <p className="nav-section-label">Browse</p>}

          {/* Browse nav items */}
          {navItems.map(item => (
            <button
              key={item.label}
              className={`nav-item ${
                view === "browse" && (
                  (Array.isArray(category) && Array.isArray(item.value))
                    ? category.join() === item.value.join()
                    : category === item.value
                ) ? "active" : ""
              }`}
              onClick={() => { setView("browse"); setCategory(item.value); }}
              title={!sidebarOpen ? item.label : ""}
            >
              <span className={`nav-dot ${item.dot}`}></span>
              {sidebarOpen && <span className="nav-label-text">{item.label}</span>}
            </button>
          ))}

          {/* Favorites nav item */}
          {sidebarOpen && <p className="nav-section-label" style={{ marginTop: "16px" }}>My account</p>}
          <button
            className={`nav-item ${view === "favorites" ? "active" : ""}`}
            onClick={() => setView("favorites")}
            title={!sidebarOpen ? "My favorites" : ""}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5"
              fill={view === "favorites" ? "currentColor" : "none"}
              style={{ flexShrink: 0, color: view === "favorites" ? "var(--red)" : "var(--text-tertiary)" }}>
              <path d="M8 13.5S1.5 9.5 1.5 5.5a3.5 3.5 0 017 0 3.5 3.5 0 017 0c0 4-6.5 8-6.5 8z"/>
            </svg>
            {sidebarOpen && <span className="nav-label-text">My favorites</span>}
            {sidebarOpen && favorites.size > 0 && (
              <span className="fav-count-badge">{favorites.size}</span>
            )}
          </button>
        </nav>

        <div className="sidebar-footer">
          {user ? (
            <div className="user-section">
              <div className="user-avatar">{user.email.charAt(0).toUpperCase()}</div>
              {sidebarOpen && (
                <div className="user-info">
                  <span className="user-name">{user.email.split('@')[0]}</span>
                  <span className="user-email">{user.email}</span>
                </div>
              )}
              {sidebarOpen && (
                <button className="btn-signout" onClick={() => supabase.auth.signOut()} title="Sign out">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M11 11l3-3-3-3M14 8H6"/>
                  </svg>
                </button>
              )}
            </div>
          ) : (
            sidebarOpen
              ? <button className="btn-login" onClick={() => { setAuthMode("login"); setShowAuth(true); }}>Sign in</button>
              : <button className="btn-login-icon" onClick={() => { setAuthMode("login"); setShowAuth(true); }} title="Sign in">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14s-.5-6 6-6 6 6 6 6"/>
                  </svg>
                </button>
          )}
        </div>
      </aside>

      {/* MAIN */}
      <main className="main-content">
        <header className="topbar">
          <div className="search-wrap">
            <svg className="search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="7" cy="7" r="4.5"/>
              <path d="M10.5 10.5L13.5 13.5"/>
            </svg>
            <input className="search-input" type="text" placeholder="Search businesses..."
              onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <button className="btn-sort" onClick={() => fetchData(true)}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M4 8h8M6 12h4"/>
            </svg>
            Top rated
          </button>
        </header>

        <div className="scroll-area">

          {/* ── BROWSE VIEW ── */}
          {view === "browse" && (
            <>
              <div className="grid-header">
                <span className="grid-title">
                  {category === ""
                    ? "All businesses"
                    : Array.isArray(category)
                      ? category.join(" & ")
                      : category}
                </span>
                <span className="grid-count">{filteredBusinesses.length} results</span>
              </div>
              <div className="card-grid">
                {filteredBusinesses.map(biz => renderCard(biz))}
              </div>
            </>
          )}

          {/* ── FAVORITES VIEW ── */}
          {view === "favorites" && (
            <>
              <div className="grid-header">
                <span className="grid-title">My favorites</span>
                <span className="grid-count">{favoritedBusinesses.length} saved</span>
              </div>

              {!user && (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1">
                      <path d="M8 13.5S1.5 9.5 1.5 5.5a3.5 3.5 0 017 0 3.5 3.5 0 017 0c0 4-6.5 8-6.5 8z"/>
                    </svg>
                  </div>
                  <p className="empty-title">Sign in to see your favorites</p>
                  <p className="empty-sub">Save businesses you love and find them here anytime.</p>
                  <button className="btn-empty-action" onClick={() => { setAuthMode("login"); setShowAuth(true); }}>
                    Sign in
                  </button>
                </div>
              )}

              {user && favoritedBusinesses.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1">
                      <path d="M8 13.5S1.5 9.5 1.5 5.5a3.5 3.5 0 017 0 3.5 3.5 0 017 0c0 4-6.5 8-6.5 8z"/>
                    </svg>
                  </div>
                  <p className="empty-title">No favorites yet</p>
                  <p className="empty-sub">Tap the heart on any business to save it here.</p>
                  <button className="btn-empty-action" onClick={() => setView("browse")}>
                    Browse businesses
                  </button>
                </div>
              )}

              {user && favoritedBusinesses.length > 0 && (
                <div className="card-grid">
                  {favoritedBusinesses.map(biz => renderCard(biz))}
                </div>
              )}
            </>
          )}

        </div>
      </main>
    </div>
  );
}

export default App;