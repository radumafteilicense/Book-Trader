import { Injectable } from '@angular/core';
import { BookProfile } from '../../interfaces';
import { BehaviorSubject } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class MyBooksService {
  private booksList: BookProfile[] = [];
  private BOOKS_UPDATE = new BehaviorSubject<BookProfile[]>([]);
  booksUpdate = this.BOOKS_UPDATE.asObservable();

  constructor(private httpClient: HttpClient) { }

  getBooks = () => {
    this.httpClient.get<{ message: string, books: BookProfile[] }>('http://localhost:3000/api/myBooks')
      .subscribe(({ books }) => {
        if (!books || !books.length) { return; }
        this.booksList = books;
        this.BOOKS_UPDATE.next([...this.booksList]);
      });
  }

  addBook = (title: string, description: string, tradingPreferenceList: string, category: string) => {
    const book: BookProfile = {id: null, title, description, tradingPreferenceList, category};
    this.httpClient.post<{ message: string }>('http://localhost:3000/api/myBooks', book)
      .subscribe(() => {
        this.booksList.push(book);
        this.BOOKS_UPDATE.next([...this.booksList]);
      });
  }
}
