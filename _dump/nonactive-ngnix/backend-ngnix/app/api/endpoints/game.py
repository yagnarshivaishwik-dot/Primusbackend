from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.database import SessionLocal
from app.models import PC, Game, PCGame
from app.schemas import GameBase, GameOut, PCGameOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Add new game (admin-only in future)
@router.post("/", response_model=GameOut)
def add_game(game: GameBase, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    db_game = db.query(Game).filter_by(name=game.name).first()
    if db_game:
        raise HTTPException(status_code=400, detail="Game already exists")
    db_game = Game(
        name=game.name,
        exe_path=game.exe_path,
        icon_url=game.icon_url,
        version=game.version,
        last_updated=datetime.utcnow(),
        is_free=getattr(game, "is_free", False),
    )
    db.add(db_game)
    db.commit()
    db.refresh(db_game)
    return db_game


# List all games
@router.get("/", response_model=list[GameOut])
def list_games(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Game).order_by(Game.name).all()


# Assign game to PC
@router.post("/assign", response_model=PCGameOut)
def assign_game(
    pc_id: int, game_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)
):
    pc = db.query(PC).filter_by(id=pc_id).first()
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")
    pcgame = PCGame(pc_id=pc_id, game_id=game_id)
    db.add(pcgame)
    db.commit()
    db.refresh(pcgame)
    return pcgame


# List games assigned to a PC
@router.get("/pc/{pc_id}", response_model=list[GameOut])
def games_for_pc(pc_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    pcgames = db.query(PCGame).filter_by(pc_id=pc_id).all()
    game_ids = [pg.game_id for pg in pcgames]
    games = db.query(Game).filter(Game.id.in_(game_ids)).all()
    return games
