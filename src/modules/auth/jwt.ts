import { JWT_ACCESS_KEY } from "../config/config.js";
import { IUser } from "../users/user_models.js";
import jwt from 'jsonwebtoken';

interface AccessTokenPayload {
    userId: string,
    name: string,
}

export function generateAccessToken(user: IUser): string {
    const payload: AccessTokenPayload = {
        userId: user._id!,
        name: user.name,
    };
    return jwt.sign(payload, JWT_ACCESS_KEY, { expiresIn: '15m' });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
    return jwt.verify(token, JWT_ACCESS_KEY) as AccessTokenPayload;
}