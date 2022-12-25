import fastify from "fastify";
import sensible from "@fastify/sensible";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
config();

const PORT = process.env.PORT || 5000;
const app = fastify();
//const app = fastify({ logger: true });
app.register(sensible);
app.register(cookie, { secret: process.env.COOKIE_SECRET });
app.register(cors, {
  origin: process.env.CLIENT_URL,
  credentials: true,
});

//this fastify middleware is to fake out cookie loging, can remove after implementation of loging context
app.addHook("onRequest", (req, res, done) => {
  if (req.cookies.userId !== CURRENT_USER_ID) {
    req.cookies.userId = CURRENT_USER_ID;
    res.clearCookie("userId");
    res.setCookie("userId", CURRENT_USER_ID);
  }
  done();
});
const prisma = new PrismaClient();

//faking user id by getting the id from mysql with a IIFE
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
  return await commitToDb(
    prisma.post.findMany({
      select: {
        id: true,
        title: true,
      },
    })
  );
});

app.get("/posts/:id", async (req, res) => {
  return await commitToDb(
    prisma.post
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
      })
  );
});

app.post("/posts/:id/comments", async (req, res) => {
  if (req.body.message === "" || req.body.message == null) {
    return res.send(app.httpErrors.badRequest("Message is required"));
  }

  return await commitToDb(
    prisma.comment
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
      })
  );
});

app.put("/posts/:postId/comments/:commentId", async (req, res) => {
  if (req.body.message === "" || req.body.message == null) {
    return res.send(app.httpErrors.badRequest("Message is required"));
  }

  const { userId } = await prisma.comment.findUnique({
    where: {
      id: req.params.commentId,
    },
    select: { userId: true },
  });

  if (userId !== req.cookies.userId) {
    return res.send(
      app.httpErrors.unauthorized("you can only edit your messages")
    );
  }

  return await commitToDb(
    prisma.comment.update({
      where: {
        id: req.params.commentId,
      },
      data: {
        message: req.body.message,
      },
      select: { message: true },
    })
  );
});

app.delete("/posts/:postId/comments/:commentId", async (req, res) => {
  const { userId } = await prisma.comment.findUnique({
    where: {
      id: req.params.commentId,
    },
    select: { userId: true },
  });

  if (userId !== req.cookies.userId) {
    return res.send(
      app.httpErrors.unauthorized("you can only delete your messages")
    );
  }

  return await commitToDb(
    prisma.comment.delete({
      where: {
        id: req.params.commentId,
      },
      select: { id: true },
    })
  );
});

app.post("/posts/:postId/comments/:commentId/toggleLike", async (req, res) => {
  const data = {
    commentId: req.params.commentId,
    userId: req.cookies.userId,
  };

  const like = await prisma.like.findUnique({
    where: {
      userId_commentId: data,
    },
  });

  if (like == null) {
    return await commitToDb(prisma.like.create({ data })).then(() => {
      return { addLike: true };
    });
  } else {
    return await commitToDb(
      prisma.like.delete({
        where: {
          userId_commentId: data,
        },
      })
    ).then(() => {
      return { addLike: false };
    });
  }
});

//helper function
async function commitToDb(promise) {
  const [error, data] = await app.to(promise);
  //from sensible
  if (error) return app.httpErrors.internalServerError(error.message);
  return data;
}

app.listen({ port: PORT }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`Server listening on ${address}`);
});
