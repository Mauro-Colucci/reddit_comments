export function useUser() {
  //faking reading cookie from client
  return { id: document.cookie.match(/userId=(?<id>[^;]+);?$/).groups.id };
}
