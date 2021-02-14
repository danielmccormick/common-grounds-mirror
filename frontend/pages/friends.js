// Friends do love cookies
import { getCookie, setCookie } from "../lib/cookies.js";

export {getFriends, setFriends, removeFriend, addFriend };

export default function Friends() {
    return <></>
}

/**
 * Gets friendlist from cookie. Friends do like cookies!
 *
 * @returns set of strings, each one uuid for friends
 */
function getFriends() {
        const friendshipCookie = getCookie("friends");
        return friendshipCookie.split(":");
}

/**
 * Sets friendlist as cookie lol
 *
 * @param friendList list of strings as friends
 * @returns null
 */
function setFriends(friendList) {
    setCookie("friends", friendList.join(':'), 7, "/")
}

function removeFriend(formerFriend) {
    friends = getFriends();
    friends.delete(friend);
    setFriends(friends);
}

function addFriend(friend) {
    friends = getFriends();
    friends.add(friend);
    setFriends(friends);
}
