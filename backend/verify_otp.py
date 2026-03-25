import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

from otp_email import otp_store

router = APIRouter()


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str


@router.post("/verify-otp/")
def verify_otp(payload: VerifyOtpRequest):
    email = payload.email
    otp = payload.otp
    if email not in otp_store:
        raise HTTPException(status_code=400, detail="No OTP found for this email")

    record = otp_store[email]
    expires = record["expires"]
    if time.time() > expires:
        del otp_store[email]
        raise HTTPException(status_code=400, detail="OTP expired")

    if record["otp"] != otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    del otp_store[email]
    return {"message": "Email verified successfully"}
