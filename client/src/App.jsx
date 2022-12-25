import PostList from "./componenets/PostList";
import { Route, Routes } from "react-router-dom";
import Post from "./componenets/Post";
import { PostProvider } from "./context/PostContext";

function App() {
  return (
    <div className="container">
      <Routes>
        <Route path="/" element={<PostList />} />
        <Route
          path="/posts/:id"
          element={
            <PostProvider>
              <Post />
            </PostProvider>
          }
        />
      </Routes>
    </div>
  );
}

export default App;
