import express from "express";
import { config } from "dotenv";
import createHttpError from "http-errors";
import { PrismaClient } from "@prisma/client";
import cors from "cors";
import cookieParser from "cookie-parser";
config();

const PORT = process.env.PORT || 5000;
const app = express();
app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);
app.use(cookieParser(process.env.COOKIE_SECRET));

app.use((req, res, next) => {
  if (req.cookies.userId !== CURRENT_USER_ID) {
    req.cookies.userId = CURRENT_USER_ID;
    res.clearCookie("userId");
    res.cookie("userId", CURRENT_USER_ID);
  }
  next();
});

const prisma = new PrismaClient();

//faking user id by getting the id from postgre with a IIFE
const CURRENT_USER_ID = (
  await prisma.user.findFirst({
    where: { name: "Mauro" },
  })
).id;
const COMMENT_SELECT_FIELDS = {
  id: true,
  message: true,
  parentId: true,
  createdAt: true,
  user: { select: { id: true, name: true } },
};

app.get("/posts", async (req, res) => {
  try {
    const data = await prisma.post.findMany({
      select: {
        id: true,
        title: true,
      },
    });
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json(err);
  }
});

app.get("/posts/:id", async (req, res) => {
  try {
    const data = await prisma.post
      .findUnique({
        where: { id: req.params.id },
        select: {
          body: true,
          title: true,
          comments: {
            orderBy: {
              createdAt: "desc",
            },
            select: {
              ...COMMENT_SELECT_FIELDS,
              _count: { select: { likes: true } },
            },
          },
        },
      })
      .then(async (post) => {
        const likes = await prisma.like.findMany({
          where: {
            userId: req.cookies.userId,
            commentId: { in: post.comments.map((comment) => comment.id) },
          },
        });
        return {
          ...post,
          comments: post.comments.map((comment) => {
            const { _count, ...commentFields } = comment;
            return {
              ...commentFields,
              likedByMe: likes.find((like) => like.commentId === comment.id),
              likeCount: _count.likes,
            };
          }),
        };
      });
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json(err);
  }
});

app.post("/posts/:id/comments", async (req, res) => {
  if (req.body.message === "" || req.body.message == null) {
    return res.status(400).json(createHttpError("Message is required"));
  }
  try {
    const data = await prisma.comment
      .create({
        data: {
          message: req.body.message,
          //should create a context for user loging
          userId: req.cookies.userId,
          parentId: req.body.parentId,
          postId: req.params.id,
        },
        select: COMMENT_SELECT_FIELDS,
      })
      .then((comment) => {
        return {
          ...comment,
          likeCount: 0,
          likedByMe: false,
        };
      });
    return res.status(200).json(data);
  } catch (err) {}
});

app.put("/posts/:postId/comments/:commentId", async (req, res) => {
  if (req.body.message === "" || req.body.message == null) {
    return res.status(400).json(createHttpError("Message is required"));
  }
  try {
    const { userId } = await prisma.comment.findUnique({
      where: {
        id: req.params.commentId,
      },
      select: { userId: true },
    });

    if (userId !== req.cookies.userId) {
      return res
        .status(401)
        .json(createHttpError("you can only edit your messages"));
    }
  } catch (err) {
    res.status(500).json(err);
  }
  try {
    const data = await prisma.comment.update({
      where: {
        id: req.params.commentId,
      },
      data: {
        message: req.body.message,
      },
      select: { message: true },
    });
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json(err);
  }
});

app.delete("/posts/:postId/comments/:commentId", async (req, res) => {
  try {
    const { userId } = await prisma.comment.findUnique({
      where: {
        id: req.params.commentId,
      },
      select: { userId: true },
    });

    if (userId !== req.cookies.userId) {
      return res
        .status(401)
        .json(createHttpError("you can only delete your messages"));
    }
  } catch (err) {
    res.status(500).json(err);
  }
  try {
    const data = await prisma.comment.delete({
      where: {
        id: req.params.commentId,
      },
      select: { id: true },
    });
    return res.status(200).send(data);
  } catch (err) {
    res.status(500).json(err);
  }
});

app.post("/posts/:postId/comments/:commentId/toggleLike", async (req, res) => {
  const data = {
    commentId: req.params.commentId,
    userId: req.cookies.userId,
  };
  let like;

  try {
    like = await prisma.like.findUnique({
      where: {
        userId_commentId: data,
      },
    });
  } catch (err) {
    res.status(500).json(err);
  }

  if (like == null) {
    try {
      return res.status(200).json(
        await prisma.like.create({ data }).then(() => {
          return { addLike: true };
        })
      );
    } catch (err) {
      res.status(500).json(err);
    }
  } else {
    try {
      return res.status(200).json(
        await prisma.like
          .delete({
            where: {
              userId_commentId: data,
            },
          })
          .then(() => {
            return { addLike: false };
          })
      );
    } catch (err) {
      res.status(500).json(err);
    }
  }
});

app.listen(PORT, () => {
  console.log(`connected on ${PORT}`);
});
