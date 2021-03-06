import { Injectable } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { BehaviorSubject, Subject } from 'rxjs';
import { Router } from '@angular/router';
import { AuthData } from './auth.model';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  userDataSubject = new Subject<any>();

  private token: string;
  private expiresInTimeOutID: ReturnType<typeof setTimeout>;
  private authStatusListener = new BehaviorSubject<boolean>(false);

  constructor(private apiService: ApiService, private router: Router) {}

  authorized = (): boolean => {
    return this.authStatusListener.getValue();
  };

  getToken = (): string => (!localStorage.getItem('token') ? '' : this.token);

  createUser(authData: AuthData): void {
    this.apiService.createUserHttp(authData).subscribe(() => {
      this.loginUser(authData);
    });
  }

  loginUser(authData: AuthData): void {
    this.apiService.loginUserHttp(authData).subscribe(
      ({ token, expiresIn, user }) => {
        this.token = token;
        if (token) {
          this.saveToLs('loggedInUserEmail', user.email);
          this.saveToLs('loggedInUserLocation', user.location);
          this.saveToLs('phoneNumber', user.phoneNumber.toString());
          this.userDataSubject.next(user.email);
          this.setAuthTimer(expiresIn);
          this.authStatusListener.next(true);
          const now = new Date();
          const expirationDate = new Date(now.getTime() + expiresIn * 1000);
          this.saveAuthDataToLS(token, expirationDate);
          this.router.navigate(['homepage']).then().catch();
        }
      },
      () => {
        this.authStatusListener.next(false);
      }
    );
  }

  private saveAuthDataToLS = (token: string, expirationDate: Date) => {
    this.saveToLs('token', token);
    this.saveToLs('expirationDate', expirationDate.toISOString());
  };

  private clearAuthDataFromLocalStorage = () => {
    this.removeFromLs('loggedInUserEmail');
    this.removeFromLs('loggedInUserLocation');
    this.removeFromLs('token');
    this.removeFromLs('expirationDate');
    this.removeFromLs('phoneNumber');
  };

  private saveToLs = (key: string, value: string): void => {
    localStorage.setItem(key, value);
  };

  private removeFromLs = (key: string): void => {
    localStorage.removeItem(key);
  };

  autoAuthorizeUser = (): void => {
    const authInformation = this.getAuthorizationData();
    if (!authInformation) return;
    const loggedUser = localStorage.getItem('loggedInUserEmail');
    if (loggedUser) {
      this.userDataSubject.next(loggedUser);
    }
    const now = new Date();
    const expiresIn = authInformation.expirationDate.getTime() - now.getTime();
    if (expiresIn > 0) {
      this.token = authInformation.token;
      this.authStatusListener.next(true);
      this.setAuthTimer(expiresIn / 1000);
    }
  };

  private setAuthTimer = (duration: number) => {
    this.expiresInTimeOutID = setTimeout(() => {
      this.logout().then().catch();
    }, duration * 6000);
  };

  private getAuthorizationData = () => {
    const token = localStorage.getItem('token');
    const expiration = localStorage.getItem('expirationDate');
    if (!token || !expiration) {
      return;
    }
    return {
      token,
      expirationDate: new Date(expiration),
    };
  };

  async logout(): Promise<void> {
    this.token = null;
    this.authStatusListener.next(false);
    this.clearAuthDataFromLocalStorage();
    clearTimeout(this.expiresInTimeOutID);
    await this.router.navigate(['login']);
  }
}
