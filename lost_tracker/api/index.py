from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
from typing import List
import urllib.parse
import bcrypt
from jose import JWTError, jwt

from .database import engine, Base, get_db
from . import models, schemas
import os
from fastapi.staticfiles import StaticFiles

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Lost Item Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = "your-secret-key-for-development-only"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 1 week

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

@app.post("/api/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = get_password_hash(user.password)
    new_user = models.User(username=user.username, password_hash=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/api/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/items", response_model=schemas.ItemResponse)
def add_lost_item(item: schemas.ItemCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    new_item = models.LostItem(user_id=current_user.id, item_name=item.item_name.strip())
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@app.get("/api/items", response_model=List[schemas.ItemResponse])
def get_lost_items(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    items = db.query(models.LostItem).filter(models.LostItem.user_id == current_user.id).order_by(models.LostItem.lost_date.desc()).all()
    return items

@app.get("/api/purchase-suggestion")
def get_purchase_suggestion(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Find the most frequently lost item, case insensitive roughly
    most_lost = (
        db.query(models.LostItem.item_name, func.count(models.LostItem.id).label('total'))
        .filter(models.LostItem.user_id == current_user.id)
        .group_by(models.LostItem.item_name)
        .order_by(func.count(models.LostItem.id).desc())
        .first()
    )
    
    if not most_lost:
        return {"item": None, "link": None, "message": "You haven't lost anything yet!"}
        
    item_name = most_lost.item_name
    query = urllib.parse.quote(item_name)
    amazon_link = f"https://www.amazon.com/s?k={query}"
    
    return {
        "item": item_name,
        "times_lost": most_lost.total,
        "link": amazon_link,
        "message": f"You've lost '{item_name}' {most_lost.total} times! Maybe it's time to buy a new one?"
    }

@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Backend is running!"}

# Mount static files for local testing
if os.path.exists("public"):
    app.mount("/", StaticFiles(directory="public", html=True), name="static")
