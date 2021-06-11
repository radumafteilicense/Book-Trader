import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { UserData } from '../modules/auth/auth.model';
import { ApiService } from '../core/api.service';
import {
  DifferentTownConfig,
  SameTownConfig,
  TradeDetails,
} from '../interfaces';

@Injectable({
  providedIn: 'root',
})
export class CommonService {
  private notificationsNumberSubject = new BehaviorSubject<number>(0);
  notificationsNumber$ = this.notificationsNumberSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(true);
  loading$ = this.loadingSubject.asObservable();

  private tradesSubject = new BehaviorSubject<TradeDetails[]>([]);
  trades$ = this.tradesSubject.asObservable();

  constructor(private apiService: ApiService) {}

  getUser(userSearchQuery: string, byId = true): Observable<UserData> {
    return this.apiService.getUserHttp(userSearchQuery, byId);
  }

  changeDeliverySettings(
    sameTownConfig: SameTownConfig,
    differentTownConfig: DifferentTownConfig
  ): void {
    this.apiService
      .updateUserDeliverySettings({
        sameTownConfig: sameTownConfig,
        differentTownConfig: differentTownConfig,
      })
      .subscribe(() => {});
  }

  createTrade(tradeDetails: TradeDetails): Observable<unknown> {
    return this.apiService.postTrade(tradeDetails);
  }

  getTrades(): void {
    this.apiService.fetchTrades().subscribe((trades: TradeDetails[]) => {
      this.tradesSubject.next(trades);
      this.notificationsNumberSubject.next(trades.length);
    });
  }

  setLoading(flag: boolean): void {
    this.loadingSubject.next(flag);
  }
}
