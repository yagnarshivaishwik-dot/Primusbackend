from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.post("/create")
def create_backup_unavailable():
    raise HTTPException(
        status_code=501,
        detail="Database backups are managed by the PostgreSQL infrastructure (WAL-G/PITR). "
        "Use the documented backup procedures instead of this API.",
    )


@router.get("/")
def list_backups_unavailable():
    raise HTTPException(
        status_code=501,
        detail="Listing backups via API is disabled; use the PostgreSQL backup system instead.",
    )


@router.get("/download/{backup_id}")
def download_backup_unavailable(backup_id: int):
    raise HTTPException(
        status_code=501,
        detail="Backup download via API is disabled; use the PostgreSQL backup system instead.",
    )


@router.post("/restore/{backup_id}")
def restore_backup_unavailable(backup_id: int):
    raise HTTPException(
        status_code=501,
        detail="Database restore via API is disabled; use the PostgreSQL PITR/restore procedures.",
    )
