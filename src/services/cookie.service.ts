import { Response } from "express";
import config from "../config/env";
import ms from "ms";
import { TokenService } from "./token.service";

export class CookieService {
  public static ACCESS_COOKIE_NAME = "accessToken";
  public static REFRESH_COOKIE_NAME = "refreshToken";

  private static API_ROUTES = config.API_ROUTES;
  private static API_VERSION = config.API_VERSION;
  private static API_PATH = `${this.API_ROUTES}${this.API_VERSION}`;

  public static JWT_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: config.IS_PROD,
    sameSite: "strict" as "strict",
    maxAge: ms(TokenService.REFRESH_TOKEN_EXPIRATION),
    signed: true,
    path: this.API_PATH,
  };

  public static REFRESH_COOKIE_OPTIONS = {
    ...this.JWT_COOKIE_OPTIONS,
    maxAge: ms(TokenService.REFRESH_TOKEN_EXPIRATION),
    path: `${this.API_PATH}/auth`,
  };

  public static setAccessTokenCookie(res: Response, token: string) {
    res.cookie(this.ACCESS_COOKIE_NAME, token, this.JWT_COOKIE_OPTIONS);
  }

  public static setRefreshTokenCookie(res: Response, token: string) {
    res.cookie(this.REFRESH_COOKIE_NAME, token, this.REFRESH_COOKIE_OPTIONS);
  }

  public static clearAccessTokenCookie(res: Response) {
    res.clearCookie(this.ACCESS_COOKIE_NAME, {
      ...this.JWT_COOKIE_OPTIONS,
      maxAge: undefined,
    });
  }

  public static clearRefreshTokenCookie(res: Response) {
    res.clearCookie(this.REFRESH_COOKIE_NAME, {
      ...this.REFRESH_COOKIE_OPTIONS,
      maxAge: undefined,
    });
  }
}
