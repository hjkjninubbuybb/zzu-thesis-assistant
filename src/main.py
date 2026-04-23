import uvicorn


def run():
    print("管理端访问地址: http://localhost:8000/admin")
    print("学生端访问地址: http://localhost:8000/student")
    uvicorn.run("src.api.app:app", host="0.0.0.0", port=8000)


def dev():
    print("管理端访问地址: http://localhost:8000/admin")
    print("学生端访问地址: http://localhost:8000/student")
    uvicorn.run("src.api.app:app", host="127.0.0.1", port=8000, reload=True)
