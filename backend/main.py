import os
import time
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()
app = FastAPI()

# Middleware for React connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connection Logic (Uses your .env file)
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

@app.get("/")
def root():
    return {"message": "Locaroo Backend is Live!"}

# --- BUSINESSES & SORTING ---
@app.get("/businesses")
def get_businesses(category: str = None, sort_by_rating: bool = False):
    try:
        query = supabase.table("businesses").select("*")
        if category:
            query = query.ilike("category", category)
        if sort_by_rating:
            query = query.order("rating", desc=True)
        else:
            query = query.order("name")
            
        response = query.execute()
        return response.data
    except Exception as e:
        return {"error_detected": str(e)}

# --- REVIEWS & BOT VERIFICATION (Unified Version) ---
@app.post("/reviews")
def post_review(business_id: int, rating: int, comment: str, bot_check: int, user_email: str):
    # Requirement: Bot Prevention (Math Check)
    if bot_check != 12:
        raise HTTPException(status_code=400, detail="Bot check failed! Incorrect answer.")

    # Requirement: Identity Verification (Checks if email was passed from frontend)
    if not user_email or user_email == "":
        raise HTTPException(status_code=401, detail="You must be logged in to leave a review!")

    try:
        data = {
            "business_id": business_id,
            "rating": rating,
            "comment": comment,
            "user_email": user_email
        }
        supabase.table("reviews").insert(data).execute()
        return {"status": "Review added to the burrow!"}
    except Exception as e:
        return {"error": str(e)}

# --- FAVORITES / BOOKMARKING ---
@app.post("/favorites")
def toggle_favorite(business_id: int, user_id: str):
    try:
        # Check if already favorited
        existing = supabase.table("favorites").select("*")\
            .eq("user_id", user_id).eq("business_id", business_id).execute()
        
        if len(existing.data) > 0:
            # If it exists, remove it (Unfavorite logic)
            supabase.table("favorites").delete().eq("user_id", user_id).eq("business_id", business_id).execute()
            return {"status": "Removed from pouch"}
        else:
            # Otherwise, add it
            supabase.table("favorites").insert({"user_id": user_id, "business_id": business_id}).execute()
            return {"status": "Saved to pouch!"}
    except Exception as e:
        return {"error": str(e)}

# --- DEALS ---
@app.get("/deals")
def get_all_deals():
    try:
        res = supabase.table("businesses").select("*").neq("deal", "").execute()
        return res.data
    except Exception as e:
        return {"error": str(e)}

# --- STATS ---
@app.get("/businesses/{biz_id}/stats")
def get_business_stats(biz_id: int):
    try:
        res = supabase.table("reviews").select("rating").eq("business_id", biz_id).execute()
        if not res.data:
            return {"average_rating": 0, "total_reviews": 0}
        ratings = [r['rating'] for r in res.data]
        avg = sum(ratings) / len(ratings)
        return {"average_rating": round(avg, 1), "total_reviews": len(ratings)}
    except Exception as e:
        return {"error": str(e)}
@app.get("/reviews/{biz_id}")
def get_reviews_for_business(biz_id: int):
    try:
        # Fetch all reviews where business_id matches
        res = supabase.table("reviews").select("*").eq("business_id", biz_id).execute()
        return res.data
    except Exception as e:
        return {"error": str(e)}
@app.get("/favorites/{user_id}")
def get_user_favorites(user_id: str):
    try:
        res = supabase.table("favorites").select("business_id").eq("user_id", user_id).execute()
        return res.data
    except Exception as e:
        return {"error": str(e)}