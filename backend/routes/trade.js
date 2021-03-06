const express = require("express");
const fs = require("fs");

const checkAuth = require("../middleware/check-auth");
const Trade = require("../models/trade");
const Book = require("../models/book");
const TRADE_STATUSES = require("../constants").TRADE_STATUSES;

const router = express.Router();

const IMAGES_DIR_PATH = "backend/images";

const acceptingTrade = (_id, bookIds, res) => {
  Trade.find({
    _id: { $ne: _id },
    $or: [
      {
        tradedWithBookId: { $in: [...bookIds] },
      },
      {
        tradedBookId: { $in: [...bookIds] },
      },
    ],
  }).then((trades) => {
    if (trades.length) {
      trades.forEach((trade) => {
        Trade.findOneAndUpdate(
          {
            _id: { _id: trade._id },
          },
          {
            status: TRADE_STATUSES.CANCELED,
            fromUser: trade.toUser,
            toUser: trade.fromUser,
            readBy: "",
            tradedBookTitle: trade.tradedWithBookTitle,
            tradedWithBookTitle: trade.tradedBookTitle,
          },
          {
            new: true,
          }
        ).then((updatedTrade) => {
          const updatedTradeObject = updatedTrade.toObject();
          const general = require("../socket-server");
          general()
            .io.sockets.in(general().connections[updatedTradeObject.toUser])
            .emit("new_notification", { tradeData: { ...updatedTradeObject } });
        });
      });
    }
    bookIds.forEach((bookId) => {
      Book.updateOne(
        { _id: bookId },
        {
          hidden: true,
        }
      ).then(() => {
        res.status(201).json();
      });
    });
  });
};

const deleteBooksOnTradeComplete = (bookIds, res, req) => {
  bookIds.forEach((bookId) => {
    Book.findOneAndDelete({ _id: bookId }).then((book) => {
      const imagePathArray = book.imagePath.split("/");
      const path = `${IMAGES_DIR_PATH}/${
        imagePathArray[imagePathArray.length - 1]
      }`;
      fs.unlink(path, () => {
        res.status(200).json();
      });
    });
  });
};

const cancelingTrade = (bookIds, res) => {
  bookIds.forEach((bookId) => {
    Book.updateOne(
      { _id: bookId },
      {
        hidden: false,
      }
    ).then(() => {
      res.status(201).json();
    });
  });
};

router.post("", checkAuth, (req, res) => {
  const [town, method] = req.body.tradeMethod.split("-");
  const tradeData = {
    ...req.body,
    accepted: false,
    rejected: false,
    tradeMethod: {
      [town]: method,
    },
    status: TRADE_STATUSES.PENDING,
    completedBy: "",
    readBy: req.userData.email,
  };
  Book.findOne({
    _id: {
      $in: [req.body.tradedWithBookId, req.body.tradedBookId],
    },
    hidden: true,
  }).then((book) => {
    if (!book) {
      new Trade({
        ...tradeData,
      })
        .save()
        .then((trade) => {
          const newTrade = trade.toObject();
          const general = require("../socket-server");
          general()
            .io.sockets.in(general().connections[req.body.toUser])
            .emit("new_notification", { tradeData: { ...newTrade } });
          res.status(201).json();
        });
    } else {
      res.status(401).json({
        message:
          "Book is present in another active trade, please try again later",
      });
    }
  });
});

router.get("", checkAuth, (req, res, next) => {
  const { all } = req.query;
  all === "false"
    ? Trade.find({ toUser: req.userData.email }).then((trades) => {
        res.status(200).json(trades);
      })
    : Trade.find({ toUser: req.userData.email }).then((firstTrades) => {
        Trade.find({ fromUser: req.userData.email }).then((secondTrades) => {
          res.status(200).json(firstTrades.concat(secondTrades));
        });
      });
});

router.put("", checkAuth, (req, res, next) => {
  const {
    trade: {
      fromUser,
      toUser,
      _id,
      fromPhoneNumber,
      toPhoneNumber,
      readBy,
      tradedBookId,
      tradedWithBookId,
      completedBy,
      tradedWithBookTitle,
      tradedBookTitle,
    },
    tradeType,
  } = req.body;

  const bookIds = [tradedBookId, tradedWithBookId];
  let isCurrentRequestingUserInReadBy = readBy.includes(req.userData.email);
  const otherUserToBeRemoved =
    fromUser !== req.userData.email ? fromUser : toUser;
  let finalReadBy = readBy
    .concat(!isCurrentRequestingUserInReadBy ? req.userData.email : "")
    .split(otherUserToBeRemoved)
    .join("");
  let finalCompletedBy = completedBy,
    deleteBooksAfterCompleted = false,
    finalFromUser = toUser,
    finalToUser = fromUser,
    finalTradedWithBookTitle = tradedWithBookTitle,
    finalTradedBookTitle = tradedBookTitle;

  if (tradeType === TRADE_STATUSES.COMPLETED) {
    finalCompletedBy = finalCompletedBy.concat(req.userData.email);
    deleteBooksAfterCompleted =
      finalCompletedBy.includes(toUser) && finalCompletedBy.includes(fromUser);
  }

  if (fromUser === req.userData.email) {
    finalFromUser = fromUser;
    finalToUser = toUser;
  }

  if (finalFromUser !== fromUser || finalToUser !== toUser) {
    finalTradedWithBookTitle = tradedBookTitle;
    finalTradedBookTitle = tradedWithBookTitle;
  }

  Trade.updateOne(
    { _id },
    {
      status: tradeType,
      fromUser: finalFromUser,
      toUser: finalToUser,
      fromPhoneNumber: toPhoneNumber,
      toPhoneNumber: fromPhoneNumber,
      readBy: finalReadBy,
      completedBy: finalCompletedBy,
      tradedWithBookTitle: finalTradedWithBookTitle,
      tradedBookTitle: finalTradedBookTitle,
    }
  ).then(() => {
    Trade.findOne({ _id }).then((trade) => {
      const newTrade = trade.toObject();
      const general = require("../socket-server");
      general()
        .io.sockets.in(general().connections[finalToUser])
        .emit("new_notification", { tradeData: { ...newTrade } });

      switch (tradeType) {
        case TRADE_STATUSES.IN_PROGRESS: {
          acceptingTrade(_id, bookIds, res);
          break;
        }
        case TRADE_STATUSES.REJECTED: {
          res.status(201).json();
          break;
        }
        case TRADE_STATUSES.CANCELED: {
          cancelingTrade(bookIds, res);
          break;
        }
        case TRADE_STATUSES.COMPLETED: {
          if (deleteBooksAfterCompleted) {
            deleteBooksOnTradeComplete(bookIds, res, req);
          } else {
            res.status(200).json();
          }
          break;
        }
      }
    });
  });
});

router.put("/readBy", checkAuth, (req, res) => {
  const { tradeIds } = req.body;
  tradeIds.forEach((_id) => {
    Trade.findOne({ _id }).then((trade) => {
      const readBy = trade.readBy;
      const finalReadBy = !readBy.includes(req.userData.email)
        ? trade.readBy.concat(req.userData.email)
        : readBy;
      Trade.updateOne(
        { _id },
        {
          readBy: finalReadBy,
        }
      ).then(() => {
        res.status(201).json();
      });
    });
  });
});

module.exports = router;
