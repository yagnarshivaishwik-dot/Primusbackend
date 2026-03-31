import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.audit import log_action
from app.api.endpoints.auth import get_current_user
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query, enforce_cafe_ownership
from app.db.dependencies import get_cafe_db as get_db
from app.models import Setting, User
from app.schemas import SettingIn, SettingOut, SettingsBulkUpdate, SettingUpdate

router = APIRouter()


def parse_value(value: str | int | float | bool | dict | list | None, value_type: str):
    """Parse string value to appropriate type"""
    # If already parsed or None, return as-is
    if value is None or isinstance(value, (bool, int, float, dict, list)):
        return value
    if value_type == "boolean":
        return value.lower() in ("true", "1", "yes")
    elif value_type == "number":
        try:
            return int(value)
        except ValueError:
            try:
                return float(value)
            except ValueError:
                return value
    elif value_type == "json":
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def serialize_value(value, value_type: str) -> str:
    """Convert value to string for storage"""
    if value_type == "json" and isinstance(value, (dict, list)):
        return json.dumps(value)
    return str(value)


@router.get("", response_model=list[SettingOut])
def get_settings(
    category: str | None = None,
    key: str | None = None,
    public_only: bool = False,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Get settings, optionally filtered by category or key"""
    query = scoped_query(db, Setting, ctx)

    if category:
        query = query.filter(Setting.category == category)

    if key:
        query = query.filter(Setting.key == key)

    if public_only:
        query = query.filter(Setting.is_public.is_(True))

    settings = query.all()

    # Convert stored values to appropriate types
    for setting in settings:
        setting.value = parse_value(setting.value, setting.value_type)

    return settings


@router.get("/{setting_id}", response_model=SettingOut)
def get_setting(
    setting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
):
    """Get a specific setting by ID"""
    setting = db.query(Setting).filter(Setting.id == setting_id).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    enforce_cafe_ownership(setting, ctx)

    # Convert stored value to appropriate type
    setting.value = parse_value(setting.value, setting.value_type)
    return setting


@router.post("", response_model=SettingOut)
def create_setting(
    setting: SettingIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
):
    """Create a new setting"""
    # Check if setting with same category and key already exists
    existing = (
        db.query(Setting)
        .filter(Setting.category == setting.category, Setting.key == setting.key)
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=400, detail=f"Setting {setting.category}.{setting.key} already exists"
        )

    # Serialize value for storage
    stored_value = serialize_value(setting.value, setting.value_type)

    db_setting = Setting(
        category=setting.category,
        key=setting.key,
        value=stored_value,
        value_type=setting.value_type,
        description=setting.description,
        updated_by=current_user.id,
        cafe_id=ctx.cafe_id,
    )

    db.add(db_setting)
    db.commit()
    db.refresh(db_setting)

    # Log the action
    log_action(
        db,
        current_user.id,
        "setting_created",
        f"Created setting {setting.category}.{setting.key} = {setting.value}",
    )

    # Convert stored value back to appropriate type for response
    db_setting.value = parse_value(db_setting.value, db_setting.value_type)
    return db_setting


@router.put("/{setting_id}", response_model=SettingOut)
def update_setting(
    setting_id: int,
    setting_update: SettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
):
    """Update an existing setting"""
    db_setting = db.query(Setting).filter(Setting.id == setting_id).first()
    if not db_setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    enforce_cafe_ownership(db_setting, ctx)

    # Store old value for logging
    old_value = parse_value(db_setting.value, db_setting.value_type)

    # Serialize new value for storage
    stored_value = serialize_value(setting_update.value, setting_update.value_type)

    # Update the setting
    db_setting.value = stored_value
    db_setting.value_type = setting_update.value_type
    db_setting.description = setting_update.description
    db_setting.updated_by = current_user.id
    db_setting.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(db_setting)

    # Log the action
    log_action(
        db,
        current_user.id,
        "setting_updated",
        f"Updated setting {db_setting.category}.{db_setting.key} from {old_value} to {setting_update.value}",
    )

    # Convert stored value back to appropriate type for response
    db_setting.value = parse_value(db_setting.value, db_setting.value_type)
    return db_setting


@router.put("", response_model=list[SettingOut])
def bulk_update_settings(
    bulk_update: SettingsBulkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
):
    """Bulk update multiple settings"""
    updated_settings = []

    for setting_data in bulk_update.settings:
        # Find existing setting
        db_setting = (
            db.query(Setting)
            .filter(Setting.category == setting_data.category, Setting.key == setting_data.key)
            .first()
        )

        if db_setting:
            # Update existing setting
            enforce_cafe_ownership(db_setting, ctx)
            old_value = parse_value(db_setting.value, db_setting.value_type)
            stored_value = serialize_value(setting_data.value, setting_data.value_type)

            db_setting.value = stored_value
            db_setting.value_type = setting_data.value_type
            db_setting.description = setting_data.description
            db_setting.updated_by = current_user.id
            db_setting.updated_at = datetime.now(UTC)

            # Convert stored value back to appropriate type for response
            db_setting.value = parse_value(db_setting.value, db_setting.value_type)
            updated_settings.append(db_setting)

            # Log the action
            log_action(
                db,
                current_user.id,
                "setting_updated",
                f"Updated setting {setting_data.category}.{setting_data.key} from {old_value} to {setting_data.value}",
            )
        else:
            # Create new setting
            stored_value = serialize_value(setting_data.value, setting_data.value_type)

            db_setting = Setting(
                category=setting_data.category,
                key=setting_data.key,
                value=stored_value,
                value_type=setting_data.value_type,
                description=setting_data.description,
                updated_by=current_user.id,
                cafe_id=ctx.cafe_id,
            )

            db.add(db_setting)
            # Convert stored value back to appropriate type for response
            db_setting.value = parse_value(db_setting.value, db_setting.value_type)
            updated_settings.append(db_setting)

            # Log the action
            log_action(
                db,
                current_user.id,
                "setting_created",
                f"Created setting {setting_data.category}.{setting_data.key} = {setting_data.value}",
            )

    db.commit()
    return updated_settings


@router.delete("/{setting_id}")
def delete_setting(
    setting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
):
    """Delete a setting"""
    db_setting = db.query(Setting).filter(Setting.id == setting_id).first()
    if not db_setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    enforce_cafe_ownership(db_setting, ctx)

    setting_info = f"{db_setting.category}.{db_setting.key}"

    db.delete(db_setting)
    db.commit()

    # Log the action
    log_action(db, current_user.id, "setting_deleted", f"Deleted setting {setting_info}")

    return {"message": f"Setting {setting_info} deleted successfully"}


@router.get("/categories/{category}", response_model=list[SettingOut])
def get_settings_by_category(
    category: str,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Get all settings for a specific category"""
    settings = scoped_query(db, Setting, ctx).filter(Setting.category == category).all()

    # Convert stored values to appropriate types
    for setting in settings:
        setting.value = parse_value(setting.value, setting.value_type)

    return settings


@router.get("/public", response_model=list[SettingOut])
def get_public_settings(
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Get all public settings (scoped by cafe)"""
    settings = scoped_query(db, Setting, ctx).filter(Setting.is_public.is_(True)).all()

    # Convert stored values to appropriate types
    for setting in settings:
        setting.value = parse_value(setting.value, setting.value_type)

    return settings


@router.post("/initialize-defaults")
def initialize_default_settings(
    current_user: User = Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Initialize default settings for all categories"""
    if current_user.role not in ["admin", "owner", "superadmin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    # Client General Settings
    client_general_defaults = [
        {
            "key": "pc_idle_timeout_hours",
            "value": "0",
            "value_type": "number",
            "category": "client_general",
            "description": "PC idle timeout hours",
        },
        {
            "key": "pc_idle_timeout_minutes",
            "value": "0",
            "value_type": "number",
            "category": "client_general",
            "description": "PC idle timeout minutes",
        },
        {
            "key": "pc_idle_timeout_seconds",
            "value": "0",
            "value_type": "number",
            "category": "client_general",
            "description": "PC idle timeout seconds",
        },
        {
            "key": "gdpr_enabled",
            "value": "false",
            "value_type": "boolean",
            "category": "client_general",
            "description": "GDPR compliance enabled",
        },
        {
            "key": "gdpr_age_level",
            "value": "16",
            "value_type": "number",
            "category": "client_general",
            "description": "GDPR minimum age level",
        },
        {
            "key": "profile_access_enabled",
            "value": "true",
            "value_type": "boolean",
            "category": "client_general",
            "description": "Allow users to access profile",
        },
        {
            "key": "profile_general_info",
            "value": "true",
            "value_type": "boolean",
            "category": "client_general",
            "description": "Allow general info access",
        },
        {
            "key": "profile_see_offers",
            "value": "true",
            "value_type": "boolean",
            "category": "client_general",
            "description": "Allow users to see offers",
        },
        {
            "key": "profile_edit_credentials",
            "value": "true",
            "value_type": "boolean",
            "category": "client_general",
            "description": "Allow credential editing",
        },
        {
            "key": "logout_action",
            "value": "do_nothing",
            "value_type": "string",
            "category": "client_general",
            "description": "Action on client logout",
        },
        {
            "key": "hide_home_screen",
            "value": "false",
            "value_type": "boolean",
            "category": "client_general",
            "description": "Hide home screen after login",
        },
        {
            "key": "enable_events",
            "value": "true",
            "value_type": "boolean",
            "category": "client_general",
            "description": "Enable arcade events",
        },
        {
            "key": "clock_enabled",
            "value": "false",
            "value_type": "boolean",
            "category": "client_general",
            "description": "Show clock on client",
        },
        {
            "key": "allow_force_logout",
            "value": "true",
            "value_type": "boolean",
            "category": "client_general",
            "description": "Allow force logout",
        },
        {
            "key": "default_login",
            "value": "true",
            "value_type": "boolean",
            "category": "client_general",
            "description": "Enable default login method",
        },
        {
            "key": "manual_account_creation",
            "value": "true",
            "value_type": "boolean",
            "category": "client_general",
            "description": "Allow manual account creation at PC",
        },
        {
            "key": "free_time_assigned",
            "value": "false",
            "value_type": "boolean",
            "category": "client_general",
            "description": "Assign free time to new accounts",
        },
        {
            "key": "free_time_days",
            "value": "0",
            "value_type": "number",
            "category": "client_general",
            "description": "Free time days to assign",
        },
        {
            "key": "free_time_hours",
            "value": "1",
            "value_type": "number",
            "category": "client_general",
            "description": "Free time hours to assign",
        },
        {
            "key": "free_time_minutes",
            "value": "0",
            "value_type": "number",
            "category": "client_general",
            "description": "Free time minutes to assign",
        },
        {
            "key": "persistent_lock",
            "value": "true",
            "value_type": "boolean",
            "category": "client_general",
            "description": "Keep PC locked after reboot",
        },
    ]

    # Client Version Settings
    client_version_defaults = [
        {
            "key": "latest_stable",
            "value": "3.0.1467.0",
            "value_type": "string",
            "category": "client_version",
            "description": "Latest stable version",
        },
        {
            "key": "latest_beta",
            "value": "3.0.1481.0",
            "value_type": "string",
            "category": "client_version",
            "description": "Latest beta version",
        },
        {
            "key": "latest_alpha",
            "value": "3.0.1503.0",
            "value_type": "string",
            "category": "client_version",
            "description": "Latest alpha version",
        },
        {
            "key": "current_versions",
            "value": '["vaishwik Version: 3.0.1481.0 (Beta)"]',
            "value_type": "json",
            "category": "client_version",
            "description": "Current deployed versions",
        },
    ]

    # Client Console Settings
    client_console_defaults = [
        {
            "key": "consoles",
            "value": "[]",
            "value_type": "json",
            "category": "client_consoles",
            "description": "List of available consoles",
        },
        {
            "key": "auto_logout_enabled",
            "value": "true",
            "value_type": "boolean",
            "category": "client_consoles",
            "description": "Auto logout users from consoles",
        },
    ]

    # Client Customization Settings
    client_customization_defaults = [
        {
            "key": "center_logo",
            "value": "",
            "value_type": "string",
            "category": "client_customization",
            "description": "Center logo base64 data",
        },
        {
            "key": "logged_out_background_type",
            "value": "video",
            "value_type": "string",
            "category": "client_customization",
            "description": "Background type for logged out state",
        },
        {
            "key": "logged_out_video_background",
            "value": "/videos/sample-video1.mp4",
            "value_type": "string",
            "category": "client_customization",
            "description": "Video background for logged out state",
        },
        {
            "key": "logged_out_image_background",
            "value": "",
            "value_type": "string",
            "category": "client_customization",
            "description": "Image background for logged out state",
        },
        {
            "key": "logged_in_background_type",
            "value": "video",
            "value_type": "string",
            "category": "client_customization",
            "description": "Background type for logged in state",
        },
        {
            "key": "logged_in_video_background",
            "value": "/videos/sample-video2.mp4",
            "value_type": "string",
            "category": "client_customization",
            "description": "Video background for logged in state",
        },
        {
            "key": "logged_in_image_background",
            "value": "",
            "value_type": "string",
            "category": "client_customization",
            "description": "Image background for logged in state",
        },
        {
            "key": "selected_theme",
            "value": "sea_blue",
            "value_type": "string",
            "category": "client_customization",
            "description": "Selected color theme",
        },
        {
            "key": "custom_theme_primary",
            "value": "#4F46E5",
            "value_type": "string",
            "category": "client_customization",
            "description": "Custom theme primary color",
        },
        {
            "key": "custom_theme_secondary",
            "value": "#7C3AED",
            "value_type": "string",
            "category": "client_customization",
            "description": "Custom theme secondary color",
        },
    ]

    # Client Advanced Settings
    client_advanced_defaults = [
        {
            "key": "startup_commands",
            "value": "[]",
            "value_type": "json",
            "category": "client_advanced",
            "description": "Startup commands configuration",
        },
        {
            "key": "client_applications",
            "value": "[]",
            "value_type": "json",
            "category": "client_advanced",
            "description": "Client applications configuration",
        },
        {
            "key": "whitelisted_apps",
            "value": "[]",
            "value_type": "json",
            "category": "client_advanced",
            "description": "Whitelisted applications",
        },
    ]

    # Client Security Settings
    client_security_defaults = [
        {
            "key": "computers",
            "value": "[]",
            "value_type": "json",
            "category": "client_security",
            "description": "List of computers and their security groups",
        },
        {
            "key": "security_groups",
            "value": "[]",
            "value_type": "json",
            "category": "client_security",
            "description": "Security policy groups configuration",
        },
        {
            "key": "selected_computer_filter",
            "value": "all",
            "value_type": "string",
            "category": "client_security",
            "description": "Currently selected computer filter",
        },
    ]

    # Combine all defaults
    all_defaults = (
        client_general_defaults
        + client_version_defaults
        + client_console_defaults
        + client_customization_defaults
        + client_advanced_defaults
        + client_security_defaults
    )

    created_count = 0
    for setting_data in all_defaults:
        # Check if setting already exists
        existing = (
            db.query(Setting)
            .filter(
                Setting.category == setting_data["category"], Setting.key == setting_data["key"]
            )
            .first()
        )

        if not existing:
            setting = Setting(
                key=setting_data["key"],
                value=setting_data["value"],
                value_type=setting_data["value_type"],
                category=setting_data["category"],
                description=setting_data.get("description", ""),
                is_public=False,
                cafe_id=ctx.cafe_id,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.add(setting)
            created_count += 1

    db.commit()

    # Log the action
    log_action(
        db,
        current_user.id,
        "settings_initialize",
        f"Created {created_count} default settings",
        None,
    )

    return {"message": f"Initialized {created_count} default settings"}
