from __future__ import annotations

from datetime import datetime
from pathlib import Path
import sys
import hashlib
import hmac
import re
import secrets
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, desc
from sqlalchemy.orm import Session, relationship

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.append(str(BASE_DIR))

from database.db import Base, SessionLocal, engine
UPLOAD_DIR = BASE_DIR / "Back" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(64), unique=True, nullable=False, index=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    tasks = relationship("Task", back_populates="owner", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="author", cascade="all, delete-orphan")
    tokens = relationship("SessionToken", back_populates="user", cascade="all, delete-orphan")


class SessionToken(Base):
    __tablename__ = "session_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(128), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="tokens")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(160), nullable=False)
    description = Column(Text, nullable=True)
    image_path = Column(String(256), nullable=True)
    is_completed = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    owner = relationship("User", back_populates="tasks")
    comments = relationship("Comment", back_populates="task", cascade="all, delete-orphan")


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    task = relationship("Task", back_populates="comments")
    author = relationship("User", back_populates="comments")


class RegisterIn(BaseModel):
    user_id: str = Field(..., max_length=64)
    username: str = Field(..., max_length=64)
    password: str = Field(..., min_length=8)


class LoginIn(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    user_id: str
    username: str
    created_at: datetime

    class Config:
        from_attributes = True


class TokenOut(BaseModel):
    token: str
    user: UserOut


class TaskOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    is_completed: bool
    created_at: datetime
    updated_at: datetime


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=160)
    description: Optional[str] = None
    is_completed: Optional[bool] = None


class CommentIn(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)


class CommentOut(BaseModel):
    id: int
    task_id: int
    user_id: int
    username: str
    content: str
    created_at: datetime


app = FastAPI(title="Student Task Manager API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str, salt: Optional[str] = None) -> str:
    if salt is None:
        salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        120_000,
    ).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, digest = stored_hash.split("$", 1)
    except ValueError:
        return False
    test = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        120_000,
    ).hex()
    return hmac.compare_digest(test, digest)


def validate_password(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not re.search(r"[A-Za-z]", password):
        raise HTTPException(status_code=400, detail="Password must contain a letter")
    if not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail="Password must contain a number")
    if not re.search(r"[^A-Za-z0-9]", password):
        raise HTTPException(status_code=400, detail="Password must contain a symbol")


def parse_bool(value: Optional[object]) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    token_row = db.query(SessionToken).filter(SessionToken.token == token).first()
    if not token_row:
        raise HTTPException(status_code=401, detail="Invalid token")
    return token_row.user


def task_to_out(task: Task) -> TaskOut:
    image_url = f"/uploads/{Path(task.image_path).name}" if task.image_path else None
    return TaskOut(
        id=task.id,
        title=task.title,
        description=task.description,
        image_url=image_url,
        is_completed=task.is_completed,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def save_upload(file: UploadFile) -> str:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Invalid file")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are allowed")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
        raise HTTPException(status_code=400, detail="Unsupported image type")
    filename = f"{secrets.token_hex(12)}{suffix}"
    dest = UPLOAD_DIR / filename
    content = file.file.read()
    dest.write_bytes(content)
    return str(dest)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/auth/register", response_model=UserOut)
def register(payload: RegisterIn, db: Session = Depends(get_db)) -> User:
    validate_password(payload.password)
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    if db.query(User).filter(User.user_id == payload.user_id).first():
        raise HTTPException(status_code=400, detail="User ID already exists")

    user = User(
        user_id=payload.user_id.strip(),
        username=payload.username.strip(),
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/api/auth/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = secrets.token_urlsafe(32)
    token_row = SessionToken(token=token, user_id=user.id)
    db.add(token_row)
    db.commit()
    return TokenOut(token=token, user=user)


@app.post("/api/auth/logout")
def logout(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        return {"status": "ok"}
    token = authorization.split(" ", 1)[1]
    db.query(SessionToken).filter(SessionToken.token == token).delete()
    db.commit()
    return {"status": "ok"}


@app.get("/api/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@app.get("/api/tasks", response_model=List[TaskOut])
def list_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[TaskOut]:
    tasks = (
        db.query(Task)
        .filter(Task.user_id == current_user.id)
        .order_by(desc(Task.created_at))
        .all()
    )
    return [task_to_out(task) for task in tasks]


@app.post("/api/tasks", response_model=TaskOut)
async def create_task(
    title: str = Form(...),
    description: Optional[str] = Form(default=None),
    is_completed: Optional[bool] = Form(default=False),
    image: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskOut:
    image_path = None
    if image:
        image_path = save_upload(image)

    task = Task(
        user_id=current_user.id,
        title=title.strip(),
        description=description.strip() if description else None,
        image_path=image_path,
        is_completed=parse_bool(is_completed),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task_to_out(task)


@app.put("/api/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskOut:
    task = (
        db.query(Task)
        .filter(Task.id == task_id, Task.user_id == current_user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if payload.title is not None:
        task.title = payload.title.strip()
    if payload.description is not None:
        task.description = payload.description.strip() if payload.description else None
    if payload.is_completed is not None:
        task.is_completed = payload.is_completed
    task.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(task)
    return task_to_out(task)


@app.post("/api/tasks/{task_id}/image", response_model=TaskOut)
async def upload_task_image(
    task_id: int,
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskOut:
    task = (
        db.query(Task)
        .filter(Task.id == task_id, Task.user_id == current_user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.image_path = save_upload(image)
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task_to_out(task)


@app.delete("/api/tasks/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    task = (
        db.query(Task)
        .filter(Task.id == task_id, Task.user_id == current_user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return {"status": "deleted"}


@app.get("/api/tasks/{task_id}/comments", response_model=List[CommentOut])
def list_comments(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[CommentOut]:
    task = (
        db.query(Task)
        .filter(Task.id == task_id, Task.user_id == current_user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    comments = (
        db.query(Comment)
        .filter(Comment.task_id == task_id)
        .order_by(Comment.created_at)
        .all()
    )
    return [
        CommentOut(
            id=comment.id,
            task_id=comment.task_id,
            user_id=comment.user_id,
            username=comment.author.username,
            content=comment.content,
            created_at=comment.created_at,
        )
        for comment in comments
    ]


@app.post("/api/tasks/{task_id}/comments", response_model=CommentOut)
def create_comment(
    task_id: int,
    payload: CommentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CommentOut:
    task = (
        db.query(Task)
        .filter(Task.id == task_id, Task.user_id == current_user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    comment = Comment(
        task_id=task_id,
        user_id=current_user.id,
        content=payload.content.strip(),
        created_at=datetime.utcnow(),
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    return CommentOut(
        id=comment.id,
        task_id=comment.task_id,
        user_id=comment.user_id,
        username=current_user.username,
        content=comment.content,
        created_at=comment.created_at,
    )
