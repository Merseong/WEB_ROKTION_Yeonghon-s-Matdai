import React, { Component } from 'react';
import SocketIO from 'socket.io-client';
import DocumentPage from './components/DocumentPage';
import MainMenuLayout from './components/MainMenuLayout';
import LoginPage from './components/LoginPage';
import userContext from './components/UserContext';

class App extends Component {
    constructor(props){
        super(props);
        this.state = {
            loginStatus: 0,
            userInfo:{},
            selectedDocumentId: -1,
            selectedPage: 0,
            documents:[],
            tags:[],
            mentionList:[],
            todoList:[],
            toMainMenu:()=>{this.setState({selectedDocumentId:-1});},
            handleLogout:this.onLogout,
            createNewMention:this.createNewMention,
            removeMention:this.removeMention,
            createNewTodo:this.createNewTodo,
            removeTodo:this.removeTodo,
            addPageAfter:this.addPageAfter,
            removePage:this.removePage,
            addNewTag:this.addNewTag,
            deleteTag:this.deleteTag,
            changeDocumentSettings:this.changeDocumentSettings,
            toggleTagInDocument:this.toggleTagInDocument,
            createNewDocument:this.createNewDocument,
            deleteDocument:this.deleteDocument,
            shareDocument:this.shareDocument,
            jumpTo:this.jumpTo,
            jumpByDbId:this.jumpByDbId,
        };
    }

    onLogin = (id, pw) => {
        fetch('/api/user/login', {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id: id,
                pw: pw
            })
        })
        .then(res => {
            if (res.status === 200) {
                return fetch(`/api/user/${id}`, { 
                    method: 'GET',
                })
            } else {
                console.error(res.status);
            }
        })
        .then(data => {
            if (data.status !== 200) {
                alert('Wrong ID or password');
                throw new Error(`Wrong ID or password`);
            }
            return data.json();
        })
        .then(userData => {
            if (userData === null) {
                alert('Wrong ID or password');
                throw new Error(`Wrong ID or password`);
            }
            console.log(userData);
            this.setState({
                userInfo: userData,
                loginStatus: 1,
            });
            //console.log(this.state.documents);
            for (let i = 0; i < userData.memos.length; ++i) {
                this.createNewTodo(userData.memos[i], false);
            }
            for (let i = 0; i < userData.mentions.length; ++i) {
                this.getMention(userData.mentions[i].mentioningUser, userData.mentions[i].docDbId, userData.mentions[i].page, userData.mentions[i].timeOfMention);
            }
            this.getUserTags();
            return this.getDocumentList();
        })
        .then(() => {
            this.reindexingDocuments();
            window.socket = SocketIO.connect(window.location.hostname, {
                reconnection: false,
            });
            this.createSocketActions();
            // 처음 소켓 연결 후 하는 동작들
            window.socket.emit('linkData', {
                tagId: this.state.userInfo.tagId,
            });
        })
        .catch(e => {
            console.error(e);
            this.setState({
                loginStatus: 0,
            });
            if (window.socket) window.socket.disconnect();
        }) 
    }

    onLogout = () => {
        // 서버에 로그오프 요청을 보낸다.
        fetch('/api/user/logoff', {
            method: 'GET'
        })
        .then(res => {
            if (res.status === 200) {
                window.socket.disconnect();
                console.log('Completely logoff');
            } else {
                console.error(res.status);
            }
        })
        .then(() => {
            // UserInfo null로 돌려놓기, Document나 Tag들도 리셋해야됨.
            this.setState({
                loginStatus: 0,
                selectedDocumentId:-1,
                userInfo:{
                    regiment:null,
                    rank:null,
                    name:null,
                },
                todoList: [],
                mentionList: [],
                documents: [],
                tags:[],
            });
        })
        .catch(e => {
            console.error(e);
        })
    }

    createSocketActions = () => {
        // 기본적인 동작
        window.socket.on('test', (jsonData) => {
            console.log(JSON.parse(jsonData).message);
        });

        // docInfo 업데이트
        window.socket.on('updateDocInfo', (docData) => {
            const docId = docData.docId;
            const docIdx = this.state.documents.findIndex(doc => doc.dbId === docId);

            if (docIdx >= 0) {
                fetch(`/api/docs/${docId}`, {
                    method: 'GET'
                })
                .then(res => {
                    if (res.status === 200) {
                        return res.json();
                    } else {
                        throw res.json();
                    }
                })
                .then(docInfo => {
                    const newDocInfo = {
                        ...this.state.documents[docIdx],
                        title: docInfo.title,
                        admin: docInfo.author,
                        description: docInfo.description,
                        color: docInfo.titleColor,
                        shareOption: docInfo.shareOption,
                    }
                    if (this.state.documents[docIdx].pagesLength !== docInfo.contents.length) {
                        newDocInfo.pagesLength = docInfo.contents.length;
                        newDocInfo.isDocumentContentLoaded = -1; // -1: 미로딩, 0: 로딩중, 1: 로딩완료
                    }
                    newDocInfo.tags.delete(0);
                    newDocInfo.tags.delete(1);
                    newDocInfo.tags.delete(2);
                    newDocInfo.tags.delete(3);
                    newDocInfo.tags.add(docInfo.status);
                    this.setState((state, _) => {
                        const newDocs = state.documents;
                        newDocs[docIdx] = newDocInfo;
                        return {
                            documents: newDocs,
                        }
                    })
                })
            }
        });

        window.socket.on('updateUser', (userTagId) => {
            if (this.state.userInfo.tagId === userTagId) {
                fetch(`/api/user/${userTagId}`, {
                    method: 'GET'
                })
                .then(res => {
                    return res.json();
                })
                .then(userData => {
                    const state = this.state;
                    
                    if (state.mentionList.length !== userData.mentions) {
                        state.mentionList = [];
                        for (let i = 0; i < userData.mentions.length; ++i) {
                            this.getMention(userData.mentions[i].mentioningUser, userData.mentions[i].docDbId, userData.mentions[i].page, userData.mentions[i].timeOfMention);
                        }
                    }
                    if (state.userInfo.relatedDocs.shared.length !== userData.relatedDocs.shared.length) {
                        state.userInfo.relatedDocs.shared = userData.relatedDocs.shared;
                        const relatedDocs = state.userInfo.relatedDocs;
                        const docsAlready = relatedDocs.created.length;
                        for (let i = docsAlready; i < relatedDocs.shared.length + docsAlready; ++i) {
                            // 이거 비동기로 돌아감
                            fetch(`/api/docs/${relatedDocs.shared[i - docsAlready].docId}`, {
                                method: 'GET'
                            })
                            .then(res => {
                                return res.json();
                            })
                            .then(docInfo => {
                                let newState = this.state.documents;
                                let newTags = relatedDocs.shared[i - docsAlready].docTags;
                                newTags.push(docInfo.status);
                                //const newAlert = relatedDocs.shared[i - docsAlready].alert;
                                newState[i] = {
                                    isShared: true,
                                    permission: relatedDocs.shared[i - docsAlready].permission,
                                    title: docInfo.title,
                                    admin: docInfo.author,
                                    description: docInfo.description,
                                    // alert 임시용
                                    alert: 0,
                                    id: i,
                                    color: docInfo.titleColor,
                                    dbId: docInfo._id,
                                    tags: new Set(newTags),
                                    onClick: () => {this.setState({selectedDocumentId: i}); },
                                    documentContent: [],
                                    isDocumentContentLoaded: -1, // -1: 미로딩, 0: 로딩중, 1: 로딩완료
                                    pagesLength: docInfo.contents.length,
                                }
                                this.setState({
                                    documents: newState
                                }); 
                                //console.log(this.state.documents[i])
                            })
                            .catch(e => {
                                console.error(e);
                            })
                        }
                    }
                })
                .catch(e => {
                    console.error(e);
                })
            }
        })
    
        window.socket.on('startPageEditing', (editing) => {
            const nextDocs = this.state.documents;
            const idx = nextDocs.findIndex(doc => doc.dbId === editing.docId)
            if (idx >= 0 && nextDocs[idx].documentContent[editing.editingPage] !== undefined) {
                nextDocs[idx].documentContent[editing.editingPage].isEditing = true;
            }

            this.setState({
                documents: nextDocs,
            })
        })

        window.socket.on('endPageEditing', (edited) => {
            const nextDocs = this.state.documents;
            const idx = nextDocs.findIndex(doc => doc.dbId === edited.docId)
            if (idx >= 0 && nextDocs[idx].documentContent[edited.editingPage] !== undefined) {
                nextDocs[idx].documentContent[edited.editingPage].isEditing = false;
            }


            this.setState({
                documents: nextDocs,
            })
        })

        window.socket.on('pageEdited', (docData) => {
            const docId = docData.docId;
            const docIdx = this.state.documents.findIndex(doc => doc.dbId === docId);

            if (docIdx >= 0) {
                const docs = this.state.documents;
                docs[docIdx].isDocumentContentLoaded = -1;
                this.setState({
                    documents: docs
                })
            }
        })
    }

    getUserTags = () => {
        console.log('Start getUserTags');
        const tags = this.state.userInfo.tags;
        for (let i = 0; i < tags.length; ++i) {
            this.addNewTag(tags[i].name, tags[i].color);
        }
        console.log(this.state.tags)
        console.log('End getUserTags');
    }
    
    getDocumentList = () => {
        console.log('Start getDocumentList');
        const relatedDocs = this.state.userInfo.relatedDocs;
        for (let i = 0; i < relatedDocs.created.length; ++i) {
            // 이거 비동기로 돌아감
            fetch(`/api/docs/${relatedDocs.created[i].docId}`, {
                method: 'GET'
            })
            .then(res => {
                return res.json();
            })
            .then(docInfo => {
                let newState = this.state.documents;
                let newTags = relatedDocs.created[i].docTags;
                newTags.push(docInfo.status);
                //const newAlert = relatedDocs.created[i].alert;
                newState[i] = {
                    title: docInfo.title,
                    admin: docInfo.author,
                    permission: 4,
                    description: docInfo.description,
                    // alert 임시용
                    alert: 0,
                    id: i,
                    color: docInfo.titleColor,
                    dbId: docInfo._id,
                    tags: new Set(newTags),
                    onClick: () => {this.setState({selectedDocumentId: i}); },
                    documentContent: [],
                    isDocumentContentLoaded: -1, // -1: 미로딩, 0: 로딩중, 1: 로딩완료
                    pagesLength: docInfo.contents.length,
                    shareOption: docInfo.shareOption,
                }
                this.setState({
                    documents: newState
                });
            })
            .catch(e => {
                console.error(e);
            })
        }

        const docsAlready = relatedDocs.created.length;
        for (let i = docsAlready; i < relatedDocs.shared.length + docsAlready; ++i) {
            // 이거 비동기로 돌아감
            fetch(`/api/docs/${relatedDocs.shared[i - docsAlready].docId}`, {
                method: 'GET'
            })
            .then(res => {
                return res.json();
            })
            .then(docInfo => {
                let newState = this.state.documents;
                let newTags = relatedDocs.shared[i - docsAlready].docTags;
                newTags.push(docInfo.status);
                //const newAlert = relatedDocs.shared[i - docsAlready].alert;
                newState[i] = {
                    isShared: true,
                    permission: relatedDocs.shared[i - docsAlready].permission,
                    title: docInfo.title,
                    admin: docInfo.author,
                    description: docInfo.description,
                    // alert 임시용
                    alert: 0,
                    id: i,
                    color: docInfo.titleColor,
                    dbId: docInfo._id,
                    tags: new Set(newTags),
                    onClick: () => {this.setState({selectedDocumentId: i}); },
                    documentContent: [],
                    isDocumentContentLoaded: -1, // -1: 미로딩, 0: 로딩중, 1: 로딩완료
                    pagesLength: docInfo.contents.length,
                }
                this.setState({
                    documents: newState
                }); 
            })
            .catch(e => {
                console.error(e);
            })
        }
        console.log('End getDocumentList');
    }

    getPageContents = (document, idx) => {
        document.isDocumentContentLoaded = 0;
        for (let i = 0; i < document.pagesLength; ++i) {
            fetch(`/api/docs/${document.dbId}/${i}`, {
                method: 'GET'
            })
            .then(res => {
                return res.json();
            })
            .then(page => {
                if (page === null) {
                    throw new Error(`Got NULL page, ${document.dbId}/${i}`)
                }
                //console.log(page);
                let docs = this.state.documents;
                //console.log(docs[idx]);
                docs[idx].documentContent[i] = 
                {
                    content: page.content,
                    updateLocalPageContents: this.updateLocalPageContents,
                    idx: idx,
                    page: i,
                    dbId: document.dbId,
                    pageId: page._id,
                };
                ++(docs[idx].isDocumentContentLoaded);
                this.setState({
                    documents: docs,
                });
            })
            .catch(e => {
                console.error(e);
            })
        }
    }

    addPageAfter = (afterPageIdx) => {
        return new Promise((resolve, reject) => {
            fetch(`/api/docs/${this.state.documents[this.state.selectedDocumentId].dbId}`, {
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        afterIdx: afterPageIdx
                    })
            })
            .then(res => {
                console.log(afterPageIdx)
                if (res.status === 201) {
                    const docs = this.state.documents;
                    for (let i = afterPageIdx + 2; i < docs[this.state.selectedDocumentId].documentContent.length; ++i) {
                        docs[this.state.selectedDocumentId].documentContent[i].page = i + 1;
                    }
                    docs[this.state.selectedDocumentId].documentContent.splice(afterPageIdx + 1, 0, {
                        content: '',
                        updateLocalPageContents: this.updateLocalPageContents,
                        idx: this.state.selectedDocumentId,
                        page: afterPageIdx + 1,
                        dbId: docs[this.state.selectedDocumentId].dbId,
                    });
                    ++docs.pagesLength;
                    this.setState({
                        documents: docs,
                    });
                } else {
                    throw new Error(res.json());
                }
            })
            .then(() => {
                window.socket.emit('updateDocInfo', {
                    docId: this.state.documents[this.state.selectedDocumentId].dbId,
                });
                resolve();
            })
            .catch(e => {
                reject(e);
            })
        })
    }

    removePage = (rmIdx) => {
        return new Promise((resolve, reject) => {
            fetch(`/api/docs/${this.state.documents[this.state.selectedDocumentId].dbId}/${rmIdx}`, {
                method: 'DELETE',
            })
            .then(res => {
                if (res.status === 200) {
                    const docs = this.state.documents;
                    docs[this.state.selectedDocumentId].documentContent.splice(rmIdx, 1);
                    for (let i = rmIdx; i < docs[this.state.selectedDocumentId].documentContent.length; ++i) {
                        docs[this.state.selectedDocumentId].documentContent[i].page = i;
                    }
                    --docs.pagesLength;
                    this.setState({
                        documents: docs,
                    })
                } else {
                    throw new Error(res.json());
                }
            })
            .then(() => {
                window.socket.emit('updateDocInfo', {
                    docId: this.state.documents[this.state.selectedDocumentId].dbId,
                });
                resolve();
            })
            .catch(e => {
                reject(e);
            })
        })
    }

    updateLocalPageContents = (idx, page, content) => {
        let docs = this.state.documents;
        //console.log(docs[idx]);
        docs[idx].documentContent[page].content = content;
        this.setState({
            documents: docs,
        })
    }
        
    addNewTag = (name, color, isNew = false) => {
        const tags = this.state.tags;
        this.setState({
            tags: tags.concat({
                name: name,
                id: tags.length,
                color: color,
            }),
        })
        
        if (isNew) {
            // 서버에 추가한 태그를 보낸다
            fetch(`/api/user/${this.state.userInfo.tagId}`, {
                method: 'PUT',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tags: {
                        action: 'add',
                        name: name,
                        color: color,
                    }
                })
            })
        }
    }

    deleteTag = (id) => {
        // 0번부터 4번까지는 기본태그기 때문에 삭제 불가능하게 해야됨
        // MainMenuLayout에서 일차적으로 방지하긴 함
        if(id <= 4) return;

        let tags = this.state.tags;
        const idx = tags.findIndex(tag => (tag.id === id));
        if (idx > -1){
            tags.splice(idx, 1);
            this.setState({
                tags:tags,
            })
        }

        // 서버에 삭제한 태그의 index를 보낸다.
        fetch(`/api/user/${this.state.userInfo.tagId}`, {
            method: 'PUT',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                tags: {
                    action: 'del',
                    idx: idx
                }
            })
        });
    }

    toggleTagInDocument = (docid, tagid) => {
        const docs = this.state.documents;
        const doc = docs.find(doc => (doc.id===docid));
        let action;
        if (tagid <= 3){
            //주요태그 (진행중/예정됨/완료됨/문서)
            doc.tags.delete(0);
            doc.tags.delete(1);
            doc.tags.delete(2);
            doc.tags.delete(3);
            doc.tags.add(tagid);
            action = 'default';
        }
        else if (doc.tags.has(tagid)){
            //태그삭제
            doc.tags.delete(tagid);
            action = 'del';
        }
        else{
            //태그추가
            doc.tags.add(tagid);
            action = 'add';
        }

        this.setState({
            documents:
                docs.map(
                    doc => (
                        doc.id === docid ?
                        {...doc, tags:doc.tags}:
                        {...doc}
                    )
                )
        })

        fetch(`/api/user/${this.state.userInfo.tagId}`, {
            method: 'PUT',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                docTags: {
                    action: action,
                    docId: doc.dbId,
                    tagId: tagid,
                }
            })
        })
        .then(res => {
            if (res.status === 200 && action === 'default') {
                window.socket.emit('updateDocInfo', {
                    docId: doc.dbId,
                })
            }
        });
    }

    changeDocumentSettings = (docid, color, title) => {
        const docs = this.state.documents;
        this.setState({
            documents:
                docs.map(
                    doc => (
                        doc.id === docid ?
                        {...doc, color:color, title:title}:
                        {...doc}
                    )
                )
        })

        const docDBId = docs.find(doc => doc.id === docid).dbId;

        fetch(`/api/docs/${docDBId}`, {
            method: 'PUT',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: title,
                color: color,
            })
        })
        .then(res => {
            if (res.status === 200) {
                window.socket.emit('updateDocInfo', {
                    docId: docDBId,
                })
                return;
            } else {
                throw res.json();
            }
        });
    }

    createNewDocument = () => {
        //기본 문서 생성
        //console.log(this.state.documents, this.state.tags)
        const docs = this.state.documents;
        const id = docs.length;
        const newDoc = {
            title: "새 문서" + id,
            description: '',
            alert: 0,
            //!!!!!!! 임시 !!!!!!!!
            id: id,
            admin: this.state.userInfo.tagId,
            permission: 4,
            color: (() => {
                var letters = '0123456789ABCDEF';
                var color = '#';
                for (var i = 0; i < 6; i++) {
                  color += letters[Math.floor(Math.random() * 16)];
                }
                return color;
              })(),
            tags: new Set([0]),
            onClick: () => {this.jumpTo(id, 0)},
            isDocumentContentLoaded: -1,
            documentContent: [],
            pagesLength: 1,
        }
        // start loading screen
        fetch('/api/docs/', {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: newDoc.title,
                color: newDoc.color,
            })
        })
        .then(res => {
            if (res.status === 201) {
                return res.json();
            } else {
                throw res.json();
            }
        })
        .then(data => {
            newDoc.dbId = data.dbId;
            //console.log(newDoc);
            this.setState({
                documents: [newDoc, ...docs],
            }); 
            this.reindexingDocuments();
        })
        .then(() => {
            // end loading screen
        })
        .catch(e => {
            console.error(new Error(`Fail at create document, ${e}`));
        })
    }

    deleteDocument = (docid, perm) => {
        let docs = this.state.documents;
        const idx = docs.findIndex(doc => (doc.id === docid));

        if (idx > -1) {
            if (perm === 4) {
                fetch(`/api/docs/${docs[idx].dbId}`, {
                    method: 'DELETE',
                })
                .then(res => {
                    if (res.status === 200) {
                        return;
                    } else {
                        throw new Error(`Not deleted`);
                    }
                })
                .then(() => {
                    docs.splice(idx, 1);
                    this.setState({
                        documents:docs,
                    })
                    this.reindexingDocuments();
                    // 문서 삭제시 공유받은 사람들도 다 정리해줘야되는뎅
                })
                .catch(e => {
                    console.error(e);
                })
            } else {
                let auth;
                switch(perm) {
                    case 1:
                        auth = 'viewer';
                        break;
                    case 2:
                        auth = 'editor';
                        break;
                    case 3:
                        auth = 'director';
                        break;
                    default:
                        auth = '';
                        break;
                }
                this.shareDocument(this.state.userInfo.tagId, docid, auth, 'del')
                .then(() => {
                    docs.splice(idx, 1);
                    this.setState({
                        documents:docs,
                    })
                    this.reindexingDocuments();
                    window.socket.emit('updateDocInfo', {
                        docId: docs[idx].dbId,
                    });
                })
                .catch(e => {
                    console.error(e);
                })
            }
        } else {
            console.error(`Cannot find doc with ${docid}`);
        }
    }

    reindexingDocuments = () => {
        const docs = this.state.documents;
        this.setState({
            documents: docs.map((doc, idx) => {
                doc.id = idx;
                doc.onClick = () => {this.setState({selectedDocumentId: idx})};
                doc.documentContent = doc.documentContent.map(cont => {
                    cont.idx = idx;
                    return cont;
                });
                return doc;
            })
        });
    }

    createNewUser = (newUser) => {
        return new Promise((resolve, reject) => {
            fetch('/api/user/', {
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newUser),
            })
            .then(res => {
                if (res.status !== 201) {
                    throw res.json();
                } else {
                    resolve();
                }
            })
            .catch(e => {
                reject(e);
            })
        })
    }

    shareDocument = (targetUser, docid, authority, action = 'add') => {
        //console.log(targetUser, docid, authority);
        const doc = this.state.documents.find(doc => doc.id === docid);
        if (!doc) return;
        const shareOption = {}
        shareOption[authority] = targetUser;
        shareOption.action = action;
        //console.log(shareOption);
        return fetch(`/api/docs/${doc.dbId}`, {
            method: 'PUT',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                shareOption: shareOption,
            }),
        })
        .then(res => {
            if (res.status === 200) {
                window.socket.emit('updateUser', targetUser);
                window.socket.emit('updateDocInfo', {
                    docId: doc.dbId,
                });
                return;
            } else {
                throw res.json();
            }
        })
    }

    getMention = async (fromWho, docDbId, page, date) => {
        const resData = await fetch(`/api/user/${fromWho}`, {
            method: 'GET',
        });
        const fromUser = await resData.json();
        const mentionList = this.state.mentionList;
        const newMention = {
            id: Math.random(),
            mentioningUserRank: fromUser.rank,
            mentioningUserName: fromUser.name,
            timeOfMention: new Date(date).toLocaleString(),
            docDbId: docDbId,
            pageDbId: page,
        }
        this.setState({
            mentionList: mentionList.concat(newMention),
        });
        console.log(newMention);
    }

    createNewMention = (targetUser, docDbId, pageDbId) => {
        // 서버에서 targetUser에 mention 추가
        fetch(`/api/user/${targetUser}`, {
            method: 'PUT',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mention: {
                    action: 'add',
                    date: Date.now(),
                    docId: docDbId,
                    page: pageDbId,
                }
            }),
        })
        .then(res => {
            if (res.status === 200) {
                window.socket.emit('updateUser', targetUser);
                return;
            } else {
                throw res.json();
            }
        })
        .catch(e => {
            console.error(new Error(e));
        })
    }

    removeMention = (id) => {
        //임시로 로컬하게 삭제
        let mentionList = this.state.mentionList;
        const idx = mentionList.findIndex(mention => (mention.id === id));
        if (idx > -1) {
            mentionList.splice(idx,1);
            this.setState({
                mentionList: mentionList,
            })
        }

        fetch(`/api/user/${this.state.userInfo.tagId}`, {
            method: 'PUT',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mention: {
                    action: 'del',
                    idx: idx,
                }
            }),
        })
    }

    createNewTodo = (content, doFetch = true) => {
        if (content.length<=0) return;
        const todoList = this.state.todoList;

        // 임시로 로컬하게 저장
        this.setState({
            todoList: todoList.concat({id:Math.random(), content:content})
        });

        if (doFetch) {
            fetch(`/api/user/${this.state.userInfo.tagId}`, {
                method: 'PUT',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({memos: this.state.todoList.map(todo => todo.content).concat(content)}),
            })
        };
    }
    
    removeTodo = (id) => {
        // 임시로 로컬하게 삭제
        let todoList = this.state.todoList;
        const idx = todoList.findIndex(todo => (todo.id === id));
        if (idx > -1){
            todoList.splice(idx, 1);
            this.setState({
                todoList:todoList,
            })
        }

        fetch(`/api/user/${this.state.userInfo.tagId}`, {
            method: 'PUT',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({memos: this.state.todoList.map(todo => todo.content)}),
        })
    }

    jumpTo = (docid, page, checkPageAvailable = false) => {
        if (checkPageAvailable) {
            // 페이지 존재여부 확인
            fetch(`/api/docs/${this.state.documents.find(doc => doc.id === docid).dbId}/${page}`, {
                method: 'GET',
            })
            .then(res => {
                if (res.status !== 200 && res.status !== 304) {
                    this.setState({
                        selectedDocumentId:docid,
                        selectedPage:0,
                    });
                    alert('존재하지 않는 페이지입니다.');
                } else {
                    this.setState({
                        selectedDocumentId:docid,
                        selectedPage:page,
                    });
                }
            })
        } else {
            this.setState({
                selectedDocumentId:docid,
                selectedPage:page,
            });
        }
    }

    //필요없어졌는데 혹시 몰라서 남겨놓음
    //와 하루만에 필요해졌어 ㄷㄷㄷ
    jumpByDbId = (docDbId, pageDbId) => {
        const doc = this.state.documents.find(doc => (doc.dbId === docDbId))
        // 문서 삭제된 경우
        if (doc === undefined) return -1;
        
        const pages = doc.documentContent
        // 문서 들어가기 전엔 documentContent가 비어있으므로 이 경우 서버에서 받아와야함
        if (pages.length <= 0) this.getPageContents(doc, doc.id);
        const pageIndex = pages.findIndex(page => (page.pageId === pageDbId))
        // 페이지 삭제된 경우
        if (pageIndex === -1) return -1;
        else this.jumpTo(doc.id, pageIndex);
        return 0;
    }

    componentDidUpdate() {
        let {selectedDocumentId, documents} = this.state;
        let selectedDocument = documents.find(doc => doc?.id === selectedDocumentId);
        if (selectedDocument !== undefined && selectedDocument.isDocumentContentLoaded < 0) {
            this.getPageContents(selectedDocument, selectedDocumentId);
        }
    }

    render() {
        //console.log(this.state.documents, this.state.selectedDocumentId)
        // 0:로그인화면   1:로그인됨 
        switch(this.state.loginStatus) {
            case 0:
                return(
                    <LoginPage
                        handleLogin={this.onLogin}
                        createNewUser={this.createNewUser}
                    />
                );
            case 1:
                let {selectedDocumentId, documents} = this.state;
                let selectedDocument = documents.find(doc => doc?.id === selectedDocumentId);
                //console.log(selectedDocument);

                return (
                    <userContext.Provider value={this.state}>
                    {selectedDocument !== undefined ? <DocumentPage/> : <MainMenuLayout tags={this.state.tags}/> } 
                    </userContext.Provider> 
                );
            default:
                break;
        }
    }
};

export default App;
