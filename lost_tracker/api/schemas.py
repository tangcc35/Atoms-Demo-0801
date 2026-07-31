from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

class UserCreate(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class ItemCreate(BaseModel):
    item_name: str

class ItemResponse(BaseModel):
    id: int
    item_name: str
    lost_date: datetime

    class Config:
        from_attributes = True
