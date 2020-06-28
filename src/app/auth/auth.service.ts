import { Injectable } from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { Router } from "@angular/router";
import { catchError, tap } from "rxjs/operators";
import { throwError, BehaviorSubject } from "rxjs";

import { User } from "./user.model";
import { environment } from '../../environments/environment';

export interface AuthResponseData {     //exported for using in auth component
    kind: string;
    idToken: string;
    email: string;
    refreshToken: string;
    expiresIn: string;
    localId: string;
    registered?: string;                // "?" means optional property. here "registered" will be available in signin request only.
}

@Injectable({providedIn: 'root'})
export class AuthService{
    user = new BehaviorSubject<User>(null);     //"null" is the starting initial value of BehaviorSubject here. Its (BehaviourSubject's) last/previously emitted value can be accessed, even after it is "subscribed after" that value has already been emitted.
    private tokenExpirationTimer: any;

    constructor(private http: HttpClient, private router: Router) {}

    signup(email: string, password: string){
        return this.http.post<AuthResponseData>(
            'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + environment.firebaseAPIKey,
            {
                email: email,
                password: password,
                returnSecureToken: true
            }
        )
        .pipe(
            catchError(this.handleError),
            tap(resData => {
                this.handleAuthentication(
                    resData.idToken,
                    resData.localId,
                    resData.idToken,
                    +resData.expiresIn
                );
            })
        );
    }

    login(email: string, password: string){
        return this.http.post<AuthResponseData>(
            'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + environment.firebaseAPIKey,
            {
                email: email,
                password: password,
                returnSecureToken: true
            }
        )
        .pipe(catchError(this.handleError),
            tap(resData => {
                this.handleAuthentication(
                    resData.idToken,
                    resData.localId,
                    resData.idToken,
                    +resData.expiresIn
                );
            })
        );
    }

    autoLogin(){
        const userData: {
            email: string;
            id: string;
            _token: string;
            _tokenExpirationDate: string;
        } = JSON.parse(localStorage.getItem('userData'));
        if (!userData){
            return;
        }

        const loadedUser = new User(        //Creating the user object from the user model
            userData.email,
            userData.id,
            userData._token,
            new Date(userData._tokenExpirationDate)     //Converting the date string into date object
        );

        if(loadedUser.token) {                          // checking if the token is expired or not
            this.user.next(loadedUser);                 // authenticating the user
            const expirationDuration =                                              //  subtraction gives us expiration time left in ms.
                new Date(userData._tokenExpirationDate).getTime() -                 //  token expiration time value "in ms & since 1970"
                new Date().getTime();                                               //  current time value "in ms & since 1970"
            this.autoLogout(expirationDuration);
        }
    }

    logout() {
        this.user.next(null);
        this.router.navigate(['/auth']);
        localStorage.removeItem('userData');
        if(this.tokenExpirationTimer) {
            clearTimeout(this.tokenExpirationTimer);
        }
        this.tokenExpirationTimer = null;
    }

    autoLogout(expirationDuration: number){     // expirationDuration in ms.
        this.tokenExpirationTimer = setTimeout(()=>{
            this.logout();
        }, expirationDuration);
    }

    private handleAuthentication(
        email: string,
        userId: string,
        token: string,
        expiresIn: number
        ) {
        const expirationDate = new Date(new Date().getTime() + expiresIn * 1000);   //"getTime()" gives us time in ms since 1970 whereas "getSeconds()" gives us current local time in ms.
        const user = new User(email, userId, token, expirationDate);
        this.user.next(user);
        this.autoLogout(expiresIn * 1000);
        localStorage.setItem('userData',JSON.stringify(user));
    }

    private handleError(errorRes: HttpErrorResponse) {
        let errorMessage = 'An unknown error occured!';
        if(!errorRes.error || !errorRes.error.error){
            return throwError(errorMessage);
        }
        switch(errorRes.error.error.message){
            case 'EMAIL_EXISTS' :
                errorMessage = 'This email exists already';
                break;
            case 'EMAIL_NOT_FOUND' :
                errorMessage = 'This email does not exist.';
                break;
            case 'INVALID_PASSWORD' :
                errorMessage = 'This password is not correct.';
                break;
        }
        return throwError(errorMessage);    //always use throwError() while returning from within catchError()

    }
}
